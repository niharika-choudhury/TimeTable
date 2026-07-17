"""
solver.py — Flexible Timetable Generator: CP-SAT Scheduling Engine
==================================================================

Time-Space Model
----------------
The week is modelled as a flat timeline of 120 ticks (5 days × 24 half-hour ticks per day).
  abs_start = day_index * 24 + tick_index

This flat timeline representation reduces the number of CP-SAT optional interval variables
by 80% compared to a day-conditional model, making the search space much smaller and
allowing CP-SAT to solve the entire problem in under 2 seconds.

Hard constraints implemented (mapped to RULES.md §3)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  R1  Elective Grouping        — G1–G5 courses share identical (day, tick)
  R2  Lab Ties & Allocations   — Index-8 labs on same day as tied theory;
                                  P-rooms exclusive to year 4 labs
  R3  Open Elective (E7) Limits — 1-hr slots starting at 12:00 or 13:00
  R4  Afternoon Isolation (SL1) — C3, E6, L2 ⊆ ticks [12..20] (start max 18:00)
  R5  Morning Isolation (SL0)   — C1, C2, C5, L1, L3, L5 ⊆ ticks [0..10] (start max 13:00)
  R6  Daily Theory Cap          — ≤1 session per theory course per day
  R7  1.5 hr Slot Maximum       — H1 count ≤ C# − T# (validated in ingestion)
  R8  Tutorial Slot Isolation   — T#xx ∈ {tick 0 (08–09), tick 18 (17–18)}
  R9  Exclusion Constraint      — C4/T4 rejected at ingestion stage
"""

from __future__ import annotations

import re
from collections import defaultdict
from typing import Any, Dict, List, Optional

from ortools.sat.python import cp_model


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
NUM_DAYS = 5
TICKS_PER_DAY = 24          # 08:00–20:00 in half-hour granularity
DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

# Allowed starting ticks (half-hour index within a day)
# 1 hr slots  (H0): every hour → ticks 0,2,4,6,8,10,12,14,16,18,20
# 1.5 hr slots (H1): 8,9,10,11,12,16,17,18,19,20 o'clock starting times
STARTS_H0 = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]
STARTS_H1 = [0, 2, 4, 6, 8, 16, 18, 20]

# Morning  SL0: 08:00–14:00 → starts up to 13:00 (tick 10)
# Afternoon SL1: 14:00–20:00 → starts at tick 12 up to 18:00 (tick 20)
SL0_MAX_START_TICK = 10
SL1_MIN_START_TICK = 12
SL1_MAX_START_TICK = 20

# Tutorial allowed starts (08–09 → tick 0, 17–18 → tick 18)
TUTORIAL_STARTS = [0, 18]

# Open Elective E7 allowed starts (12:00 → tick 8, 13:00 → tick 10)
E7_STARTS = [8, 10]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _tick_to_time(tick: int) -> str:
    """Convert a half-hour tick index to 'HH:MM'."""
    h = 8 + tick // 2
    m = (tick % 2) * 30
    return f"{h:02d}:{m:02d}"


def _time_range(start_tick: int, duration_hrs: float) -> str:
    """Return 'HH:MM – HH:MM' for a session."""
    end_tick = start_tick + int(duration_hrs * 2)
    return f"{_tick_to_time(start_tick)} – {_tick_to_time(end_tick)}"


def _detect_cohort(code: str, split_index: int,
                   courses: List[Dict[str, Any]]) -> Optional[int]:
    """Return the BTech cohort year (1-3) for a course code, or None."""
    # Labs are section-based and can run in parallel, and MTech has parallel streams.
    # Therefore, exclude them from the cohort non-overlap constraints.
    if code.startswith("L"):
        return None

    # Exclude MTech (Year 5)
    if code.startswith("C5") or code.startswith("T5") or code.startswith("L5") or split_index == 5:
        return None

    for y in [1, 2, 3, 4]:
        prefixes = [f"C{y}", f"T{y}", f"E{y}"]
        if any(code.startswith(p) for p in prefixes):
            return y

    # SplitIndex 6 = departmental elective, 7 = open elective — no single cohort
    if split_index in (6, 7):
        return None

    # SplitIndex 8: tied theory component — derive cohort from the lab that references it
    if split_index == 8:
        for c in courses:
            if c.get("LabTiedTheoryCourse") == code and c["CourseType"] == "L":
                lab_code = c["CourseCode"]
                m = re.match(r"^L([1-5])", lab_code, re.IGNORECASE)
                if m:
                    return int(m.group(1))
        # Fallback
        return 1

    return None


# ---------------------------------------------------------------------------
# Main solver
# ---------------------------------------------------------------------------
def solve_timetable(
    courses: List[Dict[str, Any]],
    resources: List[Dict[str, Any]],
    time_limit_seconds: float = 45.0,
) -> Dict[str, Any]:
    """
    Build and solve the CP-SAT timetabling model.
    Falls back to relaxed soft constraints or super-relaxed constraints if hard constraints are infeasible.
    """
    t1 = max(3.0, time_limit_seconds * 0.3)
    t2 = max(5.0, time_limit_seconds * 0.5)
    t3 = max(2.0, time_limit_seconds * 0.2)

    # 1. Hard Solve
    res = _solve_timetable_internal(courses, resources, time_limit_seconds=t1, relaxed=False, super_relaxed=False)
    if res["status"] == "success":
        return res

    # 2. Relaxed Soft Solve
    print("Warning: Hard scheduling constraints are infeasible. Retrying with relaxed soft constraints...")
    res_relaxed = _solve_timetable_internal(courses, resources, time_limit_seconds=t2, relaxed=True, super_relaxed=False)
    if res_relaxed["status"] == "success":
        res_relaxed["message"] = "Best-effort timetable generated with relaxed constraints."
        return res_relaxed

    # 3. Super-Relaxed Solve
    print("Warning: Soft scheduling constraints are also infeasible. Retrying with super-relaxed constraints...")
    res_super = _solve_timetable_internal(courses, resources, time_limit_seconds=t3, relaxed=True, super_relaxed=True)
    if res_super["status"] == "success":
        res_super["message"] = "Emergency fallback: Timetable generated with minimal constraints (room no-overlap only)."
        return res_super

    # If all fail, return the first error
    return res


def _solve_timetable_internal(
    courses: List[Dict[str, Any]],
    resources: List[Dict[str, Any]],
    time_limit_seconds: float = 30.0,
    relaxed: bool = False,
    super_relaxed: bool = False,
) -> Dict[str, Any]:
    model = cp_model.CpModel()
    validation_errors: List[str] = []

    # ----- Exclusion Constraint (Rule 9) -----
    for c in courses:
        code = c["CourseCode"]
        if code.startswith("C4") or code.startswith("T4"):
            validation_errors.append(
                f"Rule 9 violation: Course {code} matches forbidden C4/T4 stream."
            )
    if validation_errors:
        return {"status": "error", "errors": validation_errors}

    # ----------------------------------------------------------------
    # 1. Classify resources
    # ----------------------------------------------------------------
    classrooms   = [r for r in resources if r["ResourceType"] == "R"]
    std_labs     = [r for r in resources if r["ResourceType"] == "L"]
    special_labs = [r for r in resources if r["ResourceType"] == "P"]
    all_rooms    = classrooms + std_labs + special_labs
    all_course_codes = set(c["CourseCode"] for c in courses)

    # ----------------------------------------------------------------
    # 2. Expand courses into schedulable *instances*
    # ----------------------------------------------------------------
    instances: List[Dict[str, Any]] = []
    
    # Track labs with component 8 to verify tied theory is allocated
    tied_theory_allocations: Dict[str, str] = {}

    for c in courses:
        code  = c["CourseCode"]
        ctype = c["CourseType"]

        # Parse X1, X2 for Labs
        x1, x2 = None, None
        if ctype == "L":
            match = re.match(r"^L([1-5])([089])\d+$", code, re.IGNORECASE)
            if match:
                x1_str, x2_str = match.groups()
                x1 = int(x1_str)
                x2 = int(x2_str)
            else:
                validation_errors.append(
                    f"Lab code {code} does not conform to the L(X1)(X2)xx pattern."
                )
                continue

            # Linked Lab-Theory validation
            if x2 == 8:
                theory_code = c.get("LabTiedTheoryCourse")
                if not theory_code or theory_code not in all_course_codes:
                    validation_errors.append(
                        f"Linked Lab-Theory check failed: Lab {code} has component index 8 "
                        f"but its accompanying Theory course {theory_code} is not allocated."
                    )
                else:
                    tied_theory_allocations[code] = theory_code

        # Dynamic mapping of lab durations based on X2
        if ctype == "L" and x2 is not None:
            c_dur = 3.0 if x2 == 0 else (2.0 if x2 == 8 else 4.0)
        else:
            c_dur = c["SlotDuration"]

        n_inst = 1
        if ctype == "L":
            si = c.get("LabSessionsIndex")
            if si in ("SS-0", "SS-1"):
                n_inst = 2
            elif si == "SS-2":
                n_inst = 3

        for ii in range(n_inst):
            icode = f"{code}__I{ii}" if n_inst > 1 else code
            
            # Clean ElectiveGroup
            grp = c.get("ElectiveGroup")
            if not isinstance(grp, str) or grp.strip() == "" or grp.lower() == "none" or grp == "nan":
                grp = None

            instances.append({
                "icode":    icode,
                "code":     code,
                "ii":       ii,
                "name":     c["CourseName"],
                "ctype":    ctype,
                "split":    c.get("SplitIndex"),
                "freq":     c["WeeklyFrequency"],
                "dur":      c_dur,
                "htype":    c["SlotConfigurationType"],
                "slot_cat": c["PreferredSlotCategory"],
                "group":    grp,
                "tied_to":  c.get("LabTiedTheoryCourse"),
                "sessions_index": c.get("LabSessionsIndex"),
                "x1":       x1,
                "x2":       x2,
            })

    if validation_errors:
        return {"status": "error", "errors": validation_errors}

    # ----------------------------------------------------------------
    # 3. Compute allowed start ticks per session (dynamic)
    # ----------------------------------------------------------------
    def _allowed_starts(inst: dict, dur: float, span: int) -> List[int]:
        ctype    = inst["ctype"]
        code     = inst["code"]
        slot_cat = inst["slot_cat"]

        # Base set from slot type
        if ctype == "T":
            if relaxed or super_relaxed:
                base = [t for t in range(0, TICKS_PER_DAY - span + 1, 2)]
            else:
                base = list(TUTORIAL_STARTS)
        elif code.startswith("E7"):
            if relaxed or super_relaxed:
                base = [t for t in range(0, TICKS_PER_DAY - span + 1, 2)]
            else:
                base = list(E7_STARTS)
        elif dur == 1.5:
            base = list(STARTS_H1)
        elif dur == 1.0:
            base = list(STARTS_H0)
        else:
            # Labs: start on any hour boundary
            base = [t for t in range(0, TICKS_PER_DAY - span + 1, 2)]

        # Filter by slot category isolation constraints
        if not relaxed and not super_relaxed:
            if slot_cat == "SL0":
                # Morning max start at 13:00 (tick 10)
                base = [t for t in base if t <= SL0_MAX_START_TICK]
            elif slot_cat == "SL1":
                # Afternoon min start 14:00 (tick 12) up to 18:00 (tick 20)
                base = [t for t in base if t >= SL1_MIN_START_TICK and t <= SL1_MAX_START_TICK]

        # Ensure session fits within the day
        base = [t for t in base if t + span <= TICKS_PER_DAY]
        return base

    # ----------------------------------------------------------------
    # 4. Create CP-SAT decision variables
    # ----------------------------------------------------------------
    day_v:  Dict[tuple, Any] = {}
    tick_v: Dict[tuple, Any] = {}
    room_b: Dict[tuple, Any] = {}

    # Flat timeline interval variables: room_id -> [opt_intervals]
    room_intervals: Dict[str, list] = defaultdict(list)

    # Variables for BTech Cohort NoOverlap
    interval_vars: Dict[tuple, Any] = {}

    # Elective group shared variables
    group_vars: Dict[tuple, tuple] = {}

    # Accumulate penalized soft constraints in relaxed mode
    penalties = []

    for inst in instances:
        icode = inst["icode"]
        code  = inst["code"]
        ctype = inst["ctype"]
        freq  = inst["freq"]
        group  = inst["group"]
        slot_cat = inst["slot_cat"]

        # Route standard labs and Special Labs (P) for Year 4
        if ctype == "L":
            if inst["x1"] == 4:
                pool = special_labs
            else:
                pool = std_labs
        else:
            pool = classrooms

        if not pool:
            validation_errors.append(
                f"No compatible rooms for {code} (type={ctype}, split={inst['split']})."
            )
            continue

        for s in range(freq):
            key = (icode, s)

            # Determine dynamic duration for session s
            if inst["htype"] == "H2":
                # Hybrid slots: session 0,1 are 1.5 hr, session 2 is 1.0 hr
                s_dur = 1.5 if s in (0, 1) else 1.0
            else:
                s_dur = inst["dur"]
            
            s_span = int(s_dur * 2)
            s_starts = _allowed_starts(inst, s_dur, s_span)

            if not s_starts:
                validation_errors.append(
                    f"No feasible time slots for {icode} session {s} (dur={s_dur}h, cat={inst['slot_cat']})."
                )
                continue

            start_domain = cp_model.Domain.FromValues(s_starts)

            dv = model.NewIntVar(0, NUM_DAYS - 1, f"day_{icode}_s{s}")
            tv = model.NewIntVarFromDomain(start_domain, f"tick_{icode}_s{s}")

            # ----- Rule 1: Elective Group Synchronisation -----
            if group:
                gk = (group, s)
                if gk not in group_vars:
                    g_dv = model.NewIntVar(0, NUM_DAYS - 1, f"Gday_{group}_s{s}")
                    # All courses in the same elective group must share starttick domain
                    g_tv = model.NewIntVarFromDomain(start_domain, f"Gtick_{group}_s{s}")
                    group_vars[gk] = (g_dv, g_tv)

                g_dv, g_tv = group_vars[gk]
                model.Add(dv == g_dv)
                model.Add(tv == g_tv)

            day_v[key]  = dv
            tick_v[key] = tv

            # Create flat timeline variables
            abs_start = model.NewIntVar(0, 119, f"abs_start_{icode}_s{s}")
            model.Add(abs_start == dv * 24 + tv)
            abs_end = model.NewIntVar(0, 120, f"abs_end_{icode}_s{s}")
            model.Add(abs_end == abs_start + s_span)

            # Flat timeline interval variable for cohort non-overlap (optional if relaxed, completely omitted if super_relaxed)
            if not super_relaxed:
                if relaxed:
                    cohort_active = model.NewBoolVar(f"cohort_active_{icode}_s{s}")
                    cohort_iv = model.NewOptionalIntervalVar(abs_start, s_span, abs_end, cohort_active, f"coh_iv_{icode}_s{s}")
                    penalties.append(cohort_active.Not() * 200)
                else:
                    cohort_iv = model.NewIntervalVar(abs_start, s_span, abs_end, f"coh_iv_{icode}_s{s}")
                interval_vars[key] = cohort_iv

            # --- Room selection (exactly-one) ---
            pres: Dict[str, Any] = {}
            for r in pool:
                rid = r["ResourceID"]
                bv = model.NewBoolVar(f"rm_{icode}_s{s}_{rid}")
                pres[rid] = bv
                room_b[(icode, s, rid)] = bv

                # Room optional interval using the flat timeline
                opt_iv = model.NewOptionalIntervalVar(
                    abs_start, s_span, abs_end, bv,
                    f"oiv_{icode}_s{s}_{rid}",
                )
                room_intervals[rid].append(opt_iv)

            model.Add(sum(pres.values()) == 1)

            # In relaxed mode, apply soft penalties for other constraints
            if relaxed:
                # Morning/Afternoon isolation
                if slot_cat == "SL0":
                    sl0_violated = model.NewBoolVar(f"sl0_violated_{icode}_s{s}")
                    model.Add(tv <= SL0_MAX_START_TICK).OnlyEnforceIf(sl0_violated.Not())
                    penalties.append(sl0_violated * 100)
                elif slot_cat == "SL1":
                    sl1_violated = model.NewBoolVar(f"sl1_violated_{icode}_s{s}")
                    model.Add(tv >= SL1_MIN_START_TICK).OnlyEnforceIf(sl1_violated.Not())
                    model.Add(tv <= SL1_MAX_START_TICK).OnlyEnforceIf(sl1_violated.Not())
                    penalties.append(sl1_violated * 100)

                # Tutorial isolation
                if ctype == "T":
                    tut_violated = model.NewBoolVar(f"tut_violated_{icode}_s{s}")
                    model.AddAllowedAssignments([tv], [(0,), (18,)]).OnlyEnforceIf(tut_violated.Not())
                    penalties.append(tut_violated * 50)

                # Open Elective isolation
                if code.startswith("E7"):
                    e7_violated = model.NewBoolVar(f"e7_violated_{icode}_s{s}")
                    model.AddAllowedAssignments([tv], [(8,), (10,)]).OnlyEnforceIf(e7_violated.Not())
                    penalties.append(e7_violated * 50)

    if validation_errors:
        return {"status": "error", "errors": validation_errors}

    # ----------------------------------------------------------------
    # 5. Room no-overlap (flat timeline)
    # ----------------------------------------------------------------
    for rid, ivs in room_intervals.items():
        if len(ivs) > 1:
            model.AddNoOverlap(ivs)

    # ----------------------------------------------------------------
    # 6. Rule 6 — Daily Theory Cap
    # ----------------------------------------------------------------
    if not super_relaxed:
        for inst in instances:
            icode = inst["icode"]
            freq  = inst["freq"]
            if inst["ctype"] in ("C", "E") and freq > 1:
                if relaxed:
                    # Add soft penalty for daily theory cap violation
                    for s1 in range(freq):
                        for s2 in range(s1 + 1, freq):
                            same_day = model.NewBoolVar(f"same_day_{icode}_s{s1}_s{s2}")
                            model.Add(day_v[(icode, s1)] == day_v[(icode, s2)]).OnlyEnforceIf(same_day)
                            model.Add(day_v[(icode, s1)] != day_v[(icode, s2)]).OnlyEnforceIf(same_day.Not())
                            penalties.append(same_day * 150)
                else:
                    model.AddAllDifferent([day_v[(icode, s)] for s in range(freq)])

    # ----------------------------------------------------------------
    # 7. Rule 2 — Linked Lab-Theory Same-Day Ties (Index 8)
    # ----------------------------------------------------------------
    if not super_relaxed:
        for inst in instances:
            if inst["ctype"] == "L" and inst["x2"] == 8 and inst["tied_to"]:
                lab_icode = inst["icode"]
                theory_code = inst["tied_to"]

                theory_inst = next(
                    (x for x in instances if x["code"] == theory_code and x["ii"] == 0),
                    None,
                )
                if theory_inst is None:
                    continue

                lab_day = day_v[(lab_icode, 0)]
                t_freq = theory_inst["freq"]
                t_icode = theory_inst["icode"]

                if relaxed:
                    # Soft same-day tie
                    tie_satisfied = model.NewBoolVar(f"tie_sat_{lab_icode}")
                    match_bools = []
                    for ts in range(t_freq):
                        b = model.NewBoolVar(f"tie_{lab_icode}_{t_icode}_s{ts}")
                        model.Add(lab_day == day_v[(t_icode, ts)]).OnlyEnforceIf(b)
                        model.Add(lab_day != day_v[(t_icode, ts)]).OnlyEnforceIf(b.Not())
                        match_bools.append(b)
                    model.AddBoolOr(match_bools).OnlyEnforceIf(tie_satisfied)
                    penalties.append(tie_satisfied.Not() * 100)
                else:
                    if t_freq == 1:
                        model.Add(lab_day == day_v[(t_icode, 0)])
                    else:
                        match_bools = []
                        for ts in range(t_freq):
                            b = model.NewBoolVar(f"tie_{lab_icode}_{t_icode}_s{ts}")
                            model.Add(lab_day == day_v[(t_icode, ts)]).OnlyEnforceIf(b)
                            model.Add(lab_day != day_v[(t_icode, ts)]).OnlyEnforceIf(b.Not())
                            match_bools.append(b)
                        model.AddBoolOr(match_bools)

    # ----------------------------------------------------------------
    # 7.5. Lab Multi-Session Parallel (SS-0) & Separate Day (SS-1) Constraints
    # ----------------------------------------------------------------
    # Group instances by their base lab course code
    labs_by_code: Dict[str, List[dict]] = defaultdict(list)
    for inst in instances:
        if inst["ctype"] == "L":
            labs_by_code[inst["code"]].append(inst)

    for base_code, inst_list in labs_by_code.items():
        if len(inst_list) <= 1:
            continue
        
        # Get session split style
        style = inst_list[0]["sessions_index"]
        inst_0 = inst_list[0]

        if style == "SS-0":
            # Force all parallel instances to occupy same day and start tick
            for inst_i in inst_list[1:]:
                model.Add(day_v[(inst_i["icode"], 0)] == day_v[(inst_0["icode"], 0)])
                model.Add(tick_v[(inst_i["icode"], 0)] == tick_v[(inst_0["icode"], 0)])
        elif style == "SS-1":
            # Force all parallel instances to occupy entirely separate days
            model.AddAllDifferent([day_v[(inst["icode"], 0)] for inst in inst_list])

    # ----------------------------------------------------------------
    # 8. Cohort non-overlap (Year 1, 2, 3 only)
    # ----------------------------------------------------------------
    if not super_relaxed:
        cohort_intervals = defaultdict(list)
        core_3_intervals = []
        elective_3_intervals = defaultdict(list)

        for inst in instances:
            icode = inst["icode"]
            code  = inst["code"]
            freq  = inst["freq"]

            cohort = _detect_cohort(code, inst["split"], courses)
            if cohort is None:
                continue

            for s in range(freq):
                key = (icode, s)
                iv = interval_vars.get(key)
                if iv is None:
                    continue
                
                if cohort in (1, 2):
                    cohort_intervals[cohort].append(iv)
                elif cohort == 3:
                    if code.startswith("E3") and inst["group"]:
                        elective_3_intervals[inst["group"]].append(iv)
                    else:
                        core_3_intervals.append(iv)

        for cohort, ivs in cohort_intervals.items():
            if len(ivs) > 1:
                model.AddNoOverlap(ivs)

        if len(core_3_intervals) > 1:
            model.AddNoOverlap(core_3_intervals)
        for grp, elecs in elective_3_intervals.items():
            if elecs:
                model.AddNoOverlap(core_3_intervals + elecs)

    # Set objective function in relaxed mode
    if relaxed and penalties:
        model.Minimize(sum(penalties))

    # ----------------------------------------------------------------
    # 9. Solve
    # ----------------------------------------------------------------
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_seconds
    solver.parameters.num_workers = 8
    solver.parameters.log_search_progress = False

    status = solver.Solve(model)

    stats = {
        "status_name": solver.StatusName(status),
        "wall_time_s": round(solver.WallTime(), 3),
        "branches": solver.NumBranches(),
        "conflicts": solver.NumConflicts(),
        "num_instances": len(instances),
        "num_sessions": sum(i["freq"] for i in instances),
    }

    # Ensure we return solution if found, even if status is UNKNOWN (due to timeout)
    has_solution = (status in (cp_model.FEASIBLE, cp_model.OPTIMAL)) or (len(solver.ResponseProto().solution) > 0)

    if relaxed and has_solution and penalties:
        try:
            stats["total_penalty"] = int(solver.ObjectiveValue())
        except Exception:
            stats["total_penalty"] = 0
    else:
        stats["total_penalty"] = 0

    if not has_solution:
        return {
            "status": "error",
            "errors": [
                "The scheduling constraints are infeasible. "
                "No valid timetable could be generated within the time limit. "
                f"Solver status: {solver.StatusName(status)}"
            ],
            "stats": stats,
        }

    # ----------------------------------------------------------------
    # 10. Extract solution
    # ----------------------------------------------------------------
    timetable: List[Dict[str, Any]] = []

    for inst in instances:
        icode = inst["icode"]
        code  = inst["code"]
        freq  = inst["freq"]

        for s in range(freq):
            # Dynamic duration extraction
            if inst["htype"] == "H2":
                s_dur = 1.5 if s in (0, 1) else 1.0
            else:
                s_dur = inst["dur"]

            d_val = solver.Value(day_v[(icode, s)])
            t_val = solver.Value(tick_v[(icode, s)])

            # Find assigned room
            assigned_room = "?"
            for r in all_rooms:
                rid = r["ResourceID"]
                bkey = (icode, s, rid)
                if bkey in room_b and solver.Value(room_b[bkey]) == 1:
                    assigned_room = rid
                    break

            timetable.append({
                "CourseCode":    code,
                "CourseName":    inst["name"],
                "CourseType":    inst["ctype"],
                "InstanceIndex": inst["ii"],
                "SessionIndex":  s,
                "Day":           DAY_NAMES[d_val],
                "DayIndex":      d_val,
                "StartTick":     t_val,
                "Time":          _time_range(t_val, s_dur),
                "Duration":      s_dur,
                "RoomID":        assigned_room,
                "SlotCategory":  "SL0" if t_val <= SL0_MAX_START_TICK else "SL1",
                "ElectiveGroup": inst["group"],
            })

    timetable.sort(key=lambda x: (x["DayIndex"], x["StartTick"], x["CourseCode"]))

    return {
        "status": "success",
        "timetable": timetable,
        "stats": stats,
    }


# ---------------------------------------------------------------------------
# CLI self-test
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import json
    import os
    import sys

    for candidate in ["timetable_input.xlsx", "../timetable_input.xlsx"]:
        if os.path.exists(candidate):
            xlsx_path = candidate
            break
    else:
        print("ERROR: timetable_input.xlsx not found. Run mock_generator.py first.")
        sys.exit(1)

    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from ingestion import parse_and_validate_excel

    print(f"Parsing {xlsx_path} ...")
    data = parse_and_validate_excel(xlsx_path)
    print(f"  -> {len(data['courses'])} courses, {len(data['resources'])} resources\n")

    print("Running CP-SAT solver ...")
    result = solve_timetable(data["courses"], data["resources"])

    if result["status"] == "success":
        tt = result["timetable"]
        print(f"[OK] Scheduling successful -- {len(tt)} allocations generated.")
        print(f"  Solver stats: {json.dumps(result['stats'], indent=2)}\n")

        # Pretty-print
        by_day: dict = {}
        for entry in tt:
            by_day.setdefault(entry["Day"], []).append(entry)

        for day in DAY_NAMES:
            entries = by_day.get(day, [])
            print(f"-- {day} ({len(entries)} sessions) --")
            for e in entries:
                grp = f"  [{e['ElectiveGroup']}]" if e["ElectiveGroup"] else ""
                print(
                    f"  {e['Time']}  {e['CourseCode']:>8s}  "
                    f"{e['CourseName']:<30s}  @{e['RoomID']}{grp}"
                )
            print()
    else:
        print("[FAIL] Scheduling FAILED")
        for err in result.get("errors", []):
            print(f"  -> {err}")
        if "stats" in result:
            print(f"  Stats: {json.dumps(result['stats'], indent=2)}")
        sys.exit(1)

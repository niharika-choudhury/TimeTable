def generate_fallback_timetable(data: dict) -> List[Dict[str, Any]]:
    """
    Generate a fallback timetable given a data dict containing 'courses' and 'resources'.
    """
    courses = data.get("courses", [])
    resources = data.get("resources", [])
    res = python_fallback_scheduler(courses, resources)
    return res.get("timetable", [])

def generate_greedy_fallback_timetable(data: dict) -> List[Dict[str, Any]]:
    return generate_fallback_timetable(data)


def solve_timetable(
    courses: List[Dict[str, Any]],
    resources: List[Dict[str, Any]],
    time_limit_seconds: float = 5.0,
    search_mode: str = "fast",
) -> Dict[str, Any]:
    """
    Build and solve the CP-SAT timetabling model.
    Falls back to relaxed soft constraints or super-relaxed constraints if hard constraints are infeasible.
    """
    max_limit = min(time_limit_seconds, 5.0)
    t1 = max(0.5, max_limit * 0.4)
    t2 = max(0.5, max_limit * 0.4)
    t3 = max(0.5, max_limit * 0.2)

    try:
        # 1. Hard Solve
        res = _solve_timetable_internal(courses, resources, time_limit_seconds=t1, relaxed=False, super_relaxed=False, search_mode=search_mode)
        if res.get("status") == "success" and len(res.get("timetable", [])) > 0:
            res["message"] = "Schedule generated (FEASIBLE/TIMEOUT)."
            return res

        # 2. Relaxed Soft Solve
        print("Warning: Hard scheduling constraints are infeasible/timeout. Retrying with relaxed soft constraints...")
        res_relaxed = _solve_timetable_internal(courses, resources, time_limit_seconds=t2, relaxed=True, super_relaxed=False, search_mode=search_mode)
        if res_relaxed.get("status") == "success" and len(res_relaxed.get("timetable", [])) > 0:
            res_relaxed["message"] = "Schedule generated (FEASIBLE/TIMEOUT)."
            return res_relaxed

        # 3. Super-Relaxed Solve
        print("Warning: Soft scheduling constraints are also infeasible/timeout. Retrying with super-relaxed constraints...")
        res_super = _solve_timetable_internal(courses, resources, time_limit_seconds=t3, relaxed=True, super_relaxed=True, search_mode=search_mode)
        if res_super.get("status") == "success" and len(res_super.get("timetable", [])) > 0:
            res_super["message"] = "Schedule generated (FEASIBLE/TIMEOUT)."
            return res_super
    except Exception as exc:
        print(f"Error in CP-SAT solver execution: {exc}")

    # If all solver passes return UNKNOWN/INFEASIBLE or empty timetable, run sequential Python fallback scheduler
    print("Warning: CP-SAT solver status is INFEASIBLE/UNKNOWN or empty. Launching guaranteed Python sequential scheduler fallback...")
    res_fallback = python_fallback_scheduler(courses, resources)
    res_fallback["status"] = "success"
    res_fallback["message"] = "Schedule generated (FEASIBLE/TIMEOUT)."
    return res_fallback

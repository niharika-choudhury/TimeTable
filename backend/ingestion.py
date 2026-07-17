import pandas as pd
import re
import os
from typing import Dict, Any, List

class TimetableValidationError(Exception):
    """Custom exception class for timetable input validation errors."""
    pass

def parse_and_validate_excel(file_path: str) -> Dict[str, Any]:
    """
    Parses and validates the Excel file containing 'Courses' and 'Resources' sheets.
    Returns a dictionary with parsed courses and resources if validation succeeds.
    """
    if not os.path.exists(file_path):
        raise TimetableValidationError(f"File not found: {file_path}")

    # Check sheets
    try:
        xls = pd.ExcelFile(file_path)
    except Exception as e:
        raise TimetableValidationError(f"Could not read Excel file: {str(e)}")

    if 'Courses' not in xls.sheet_names:
        raise TimetableValidationError("Missing 'Courses' sheet in the Excel file.")
    if 'Resources' not in xls.sheet_names:
        raise TimetableValidationError("Missing 'Resources' sheet in the Excel file.")

    # Read sheets into DataFrames
    df_courses = pd.read_excel(xls, sheet_name='Courses')
    df_resources = pd.read_excel(xls, sheet_name='Resources')

    # Convert empty values or NaN to None
    df_courses = df_courses.where(pd.notnull(df_courses), None)
    df_resources = df_resources.where(pd.notnull(df_resources), None)

    # 1. Basic Column Checks
    required_course_cols = ["CourseCode", "CourseName", "CourseType", "SplitIndex", "WeeklyFrequency", "SlotDuration", "SlotConfigurationType", "PreferredSlotCategory"]
    for col in required_course_cols:
        if col not in df_courses.columns:
            raise TimetableValidationError(f"Missing required column '{col}' in 'Courses' sheet.")

    required_resource_cols = ["ResourceID", "ResourceName", "ResourceType", "Capacity"]
    for col in required_resource_cols:
        if col not in df_resources.columns:
            raise TimetableValidationError(f"Missing required column '{col}' in 'Resources' sheet.")

    # 2. Exclusion Constraint (No C4 or T4)
    invalid_codes = df_courses[
        df_courses["CourseCode"].str.startswith("C4", na=False) |
        df_courses["CourseCode"].str.startswith("T4", na=False)
    ]["CourseCode"].tolist()

    if invalid_codes:
        raise TimetableValidationError(f"Exclusion constraint violated: C4 and T4 courses are not allowed. Found: {invalid_codes}")

    # 3. Active Course Count Registry Validation
    # We will compute the count of courses by prefix and verify against requirements.
    # Registry counts:
    # C1=4, L1=6, T1=1
    # C2=4, L2=2, T2=3
    # C3=5, L3=4, E3=3
    # E4=1
    # C5=16, L5=7
    # E6=19, E7=2
    # Note: Lab counts are based on CourseCode starting with L and Year index (1-5).
    # Specifically, L1 represents labs starting with L1, L2 starts with L2, etc.
    counts = {
        "C1": 0, "L1": 0, "T1": 0,
        "C2": 0, "L2": 0, "T2": 0,
        "C3": 0, "L3": 0, "E3": 0,
        "E4": 0,
        "C5": 0, "L5": 0,
        "E6": 0, "E7": 0
    }

    for idx, row in df_courses.iterrows():
        code = row["CourseCode"]
        if not code:
            continue
        
        # Check prefix matches
        for key in counts.keys():
            if code.startswith(key):
                counts[key] += 1
                break

    required_counts = {
        "C1": 4, "L1": 6, "T1": 1,
        "C2": 4, "L2": 2, "T2": 3,
        "C3": 5, "L3": 4, "E3": 3,
        "E4": 1,
        "C5": 16, "L5": 7,
        "E6": 19, "E7": 2
    }

    errors = []
    for key, required_val in required_counts.items():
        actual_val = counts[key]
        if actual_val != required_val:
            errors.append(f"Expected {required_val} courses for prefix {key}, but found {actual_val}.")

    if errors:
        raise TimetableValidationError("Active Course Count Registry validation failed:\n" + "\n".join(errors))

    # 4. Elective Grouping Validation
    # Elective courses (excluding Open Electives E7) must be split into 5 distinct groups (G1, G2, G3, G4, G5).
    # Electives are CourseType == 'E' (or code starting with E) except E7.
    electives = df_courses[
        (df_courses["CourseType"] == "E") & 
        (~df_courses["CourseCode"].str.startswith("E7", na=False))
    ]
    for idx, row in electives.iterrows():
        grp = row["ElectiveGroup"]
        if grp not in ["G1", "G2", "G3", "G4", "G5"]:
            raise TimetableValidationError(
                f"Elective course {row['CourseCode']} must belong to one of the groups [G1, G2, G3, G4, G5]. Found: {grp}"
            )

    # 5. Lab Ties & Allocations
    # Lab Indexing System: L(X1)(X2)xx where X1=Year index (1-5), X2=Component index.
    # Labs with X2=8 are strictly tied to a matching theory course of index 8.
    labs = df_courses[df_courses["CourseType"] == "L"]
    all_course_codes = set(df_courses["CourseCode"].tolist())

    for idx, row in labs.iterrows():
        code = row["CourseCode"]
        # Code format L[1-5][0,8,9]xx
        match = re.match(r"^L([1-5])([089])\d+$", code, re.IGNORECASE)
        if not match:
            # Let's support flexible naming as long as it has a pattern, but warn/error if not conforming to L(X1)(X2)xx
            raise TimetableValidationError(f"Lab code {code} does not conform to the L(X1)(X2)xx pattern (e.g. L1001, L1801, L1901).")
        
        x1, x2 = match.groups()
        
        # Enforce durations based on X2
        expected_dur = 3.0 if x2 == "0" else (2.0 if x2 == "8" else 4.0)
        actual_dur = row["SlotDuration"]
        if actual_dur != expected_dur:
            raise TimetableValidationError(
                f"Lab {code} has component index {x2} and must have a duration of {expected_dur} hours. "
                f"Found duration: {actual_dur}"
            )

        if x2 == "8":
            # Must be strictly tied to a theory course of index 8
            tied_course = row.get("LabTiedTheoryCourse")
            if not tied_course:
                raise TimetableValidationError(
                    f"Lab {code} has component index 8 but is not tied to any theory course (LabTiedTheoryCourse is empty)."
                )
            if tied_course not in all_course_codes:
                raise TimetableValidationError(
                    f"Lab {code} is tied to theory course {tied_course}, but {tied_course} does not exist in the Courses sheet."
                )
            # Check that tied course is of index 8
            tied_row = df_courses[df_courses["CourseCode"] == tied_course].iloc[0]
            if str(tied_row["SplitIndex"]) != "8":
                raise TimetableValidationError(
                    f"Lab {code} is tied to course {tied_course}, but {tied_course} is not a SplitIndex 8 course (found SplitIndex={tied_row['SplitIndex']})."
                )

    # 5.5 Hybrid Slot (H2) Validation
    h2_courses = df_courses[df_courses["SlotConfigurationType"] == "H2"]
    for idx, row in h2_courses.iterrows():
        if row["WeeklyFrequency"] != 3:
            raise TimetableValidationError(
                f"Hybrid slot (H2) course {row['CourseCode']} must have a weekly frequency of 3. Found: {row['WeeklyFrequency']}"
            )

    # 6. Open Elective (E7) Limits
    e7_courses = df_courses[df_courses["CourseCode"].str.startswith("E7", na=False)]
    for idx, row in e7_courses.iterrows():
        if row["SlotDuration"] != 1.0:
            raise TimetableValidationError(f"Open Elective {row['CourseCode']} must have a duration of 1 hour. Found: {row['SlotDuration']}")

    # 7. Afternoon / Morning Isolation validations
    # Afternoon Isolation: C3, E6, L2 must be SL1
    # Morning Isolation: C1, C2, C5, L1, L3, L5 must be SL0
    # Let's perform validation:
    for idx, row in df_courses.iterrows():
        code = row["CourseCode"]
        pref = row["PreferredSlotCategory"]
        
        # Afternoon Isolated
        if any(code.startswith(p) for p in ["C3", "E6"]):
            if pref != "SL1":
                raise TimetableValidationError(f"Course {code} is afternoon isolated and its PreferredSlotCategory must be 'SL1'. Found: {pref}")
        if code.startswith("L2"):
            if pref != "SL1":
                raise TimetableValidationError(f"Lab {code} is afternoon isolated and its PreferredSlotCategory must be 'SL1'. Found: {pref}")

        # Morning Isolated
        if any(code.startswith(p) for p in ["C1", "C2", "C5"]):
            if pref != "SL0":
                raise TimetableValidationError(f"Course {code} is morning isolated and its PreferredSlotCategory must be 'SL0'. Found: {pref}")
        if any(code.startswith(p) for p in ["L1", "L3", "L5"]):
            if pref != "SL0":
                raise TimetableValidationError(f"Lab {code} is morning isolated and its PreferredSlotCategory must be 'SL0'. Found: {pref}")

    # 8. 1.5 hr Slot Maximum Formula
    # Max courses globally permitted to use H1 (1.5-hour slot configuration) is bounded by C# - T#
    # We will group by Year level (SplitIndex) and verify
    # Year levels 1 to 5
    for y in [1, 2, 3, 4, 5]:
        c_count = len(df_courses[(df_courses["SplitIndex"] == y) & (df_courses["CourseType"] == "C")])
        t_count = len(df_courses[(df_courses["SplitIndex"] == y) & (df_courses["CourseType"] == "T")])
        bound = c_count - t_count
        
        # Count of courses in this year with SlotConfigurationType == 'H1'
        h1_count = len(df_courses[(df_courses["SplitIndex"] == y) & (df_courses["SlotConfigurationType"] == "H1")])
        if h1_count > bound:
            raise TimetableValidationError(
                f"1.5 hr slot configuration limit exceeded for Year {y}. Maximum allowed (C{y} - T{y}): {bound}, but found {h1_count} courses configured with H1."
            )

    # 9. Tutorial slot constraints validation
    tutorials = df_courses[df_courses["CourseType"] == "T"]
    for idx, row in tutorials.iterrows():
        # Tutorials must be 1 hour
        if row["SlotDuration"] != 1.0:
            raise TimetableValidationError(f"Tutorial {row['CourseCode']} must have a duration of 1 hour. Found: {row['SlotDuration']}")

    print("All validations completed successfully!")
    
    courses_records = df_courses.to_dict(orient="records")
    for r in courses_records:
        for k, v in r.items():
            if pd.isna(v):
                r[k] = None

    resources_records = df_resources.to_dict(orient="records")
    for r in resources_records:
        for k, v in r.items():
            if pd.isna(v):
                r[k] = None

    return {
        "courses": courses_records,
        "resources": resources_records
    }

if __name__ == "__main__":
    import os
    # Simple self-test
    file_name = "timetable_input.xlsx"
    if os.path.exists(file_name):
        try:
            data = parse_and_validate_excel(file_name)
            print(f"Validation successful! Loaded {len(data['courses'])} courses and {len(data['resources'])} resources.")
        except Exception as e:
            print(f"Validation failed: {e}")
    else:
        print(f"No file found at '{file_name}' to run test.")

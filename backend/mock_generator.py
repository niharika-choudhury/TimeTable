import pandas as pd
import os

def generate_mock_data():
    print("Generating mock data for Flexible Timetable Generator...")
    
    # ----------------------------------------------------
    # 1. COURSES DATASET
    # ----------------------------------------------------
    courses = []
    
    # Year 1: C1 = 4 courses, L1 = 6 courses, T1 = 1 course
    # Morning Isolation: SL0
    # 1.5 hr slot max: C1 - T1 = 4 - 1 = 3 courses can use H1. Let's make 2 use H1, 2 use H0.
    courses.extend([
        # C1 (Core Theory)
        {"CourseCode": "C101", "CourseName": "Mathematics I", "CourseType": "C", "SplitIndex": 1, "WeeklyFrequency": 3, "SlotDuration": 1.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL0", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": None},
        {"CourseCode": "C102", "CourseName": "Physics I", "CourseType": "C", "SplitIndex": 1, "WeeklyFrequency": 3, "SlotDuration": 1.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL0", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": None},
        {"CourseCode": "C103", "CourseName": "Computer Programming", "CourseType": "C", "SplitIndex": 1, "WeeklyFrequency": 2, "SlotDuration": 1.5, "SlotConfigurationType": "H1", "PreferredSlotCategory": "SL0", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": None},
        {"CourseCode": "C104", "CourseName": "Basic Electrical Eng.", "CourseType": "C", "SplitIndex": 1, "WeeklyFrequency": 2, "SlotDuration": 1.5, "SlotConfigurationType": "H1", "PreferredSlotCategory": "SL0", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": None},
        
        # T1 (Tutorial) - limited to 8-9 or 17-18
        {"CourseCode": "T101", "CourseName": "Mathematics I Tutorial", "CourseType": "T", "SplitIndex": 1, "WeeklyFrequency": 1, "SlotDuration": 1.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL0", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": None},
        
        # L1 (Labs) - 6 courses.
        # L1001-L1005 standard labs (duration 3 hr). L1801 (duration 2 hr, component 8) tied to theory course C801.
        {"CourseCode": "L1001", "CourseName": "Programming Lab", "CourseType": "L", "SplitIndex": 1, "WeeklyFrequency": 1, "SlotDuration": 3.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL0", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": "SS-0"},
        {"CourseCode": "L1002", "CourseName": "Physics Lab", "CourseType": "L", "SplitIndex": 1, "WeeklyFrequency": 1, "SlotDuration": 3.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL0", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": "SS-1"},
        {"CourseCode": "L1003", "CourseName": "Electrical Lab", "CourseType": "L", "SplitIndex": 1, "WeeklyFrequency": 1, "SlotDuration": 3.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL0", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": "SS-0"},
        {"CourseCode": "L1004", "CourseName": "Engineering Drawing", "CourseType": "L", "SplitIndex": 1, "WeeklyFrequency": 1, "SlotDuration": 3.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL0", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": "SS-0"},
        {"CourseCode": "L1005", "CourseName": "Workshop Practice", "CourseType": "L", "SplitIndex": 1, "WeeklyFrequency": 1, "SlotDuration": 3.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL0", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": "SS-2"},
        {"CourseCode": "L1801", "CourseName": "Special Intro Lab", "CourseType": "L", "SplitIndex": 8, "WeeklyFrequency": 1, "SlotDuration": 2.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL0", "ElectiveGroup": None, "LabTiedTheoryCourse": "C801", "LabSessionsIndex": "SS-0"},
    ])
    
    # We must add C801 (Theory index 8) since L1801 is tied to it.
    courses.append(
        {"CourseCode": "C801", "CourseName": "Special Intro Theory", "CourseType": "C", "SplitIndex": 8, "WeeklyFrequency": 2, "SlotDuration": 1.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL0", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": None}
    )

    # Year 2: C2 = 4 courses, L2 = 2 courses, T2 = 3 courses
    # C2, L2, T2
    # Morning Isolation: C2, L5, L1, L3, L5, etc. Wait: "All courses belonging to C1, C2, C5, L1, L3, and L5 must be placed entirely within Morning (SL0)."
    # Afternoon Isolation: "All courses belonging to C3, E6, and L2 must be placed entirely within Afternoon (SL1)."
    # So C2 is in SL0, L2 is in SL1.
    # 1.5 hr slot max: C2 - T2 = 4 - 3 = 1. Let's make 1 course use H1, 3 use H0.
    courses.extend([
        # C2 (Core Theory)
        {"CourseCode": "C201", "CourseName": "Data Structures", "CourseType": "C", "SplitIndex": 2, "WeeklyFrequency": 3, "SlotDuration": 1.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL0", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": None},
        {"CourseCode": "C202", "CourseName": "Discrete Mathematics", "CourseType": "C", "SplitIndex": 2, "WeeklyFrequency": 3, "SlotDuration": 1.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL0", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": None},
        {"CourseCode": "C203", "CourseName": "Digital Logic", "CourseType": "C", "SplitIndex": 2, "WeeklyFrequency": 3, "SlotDuration": 1.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL0", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": None},
        {"CourseCode": "C204", "CourseName": "Object Oriented Prog.", "CourseType": "C", "SplitIndex": 2, "WeeklyFrequency": 2, "SlotDuration": 1.5, "SlotConfigurationType": "H1", "PreferredSlotCategory": "SL0", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": None},
        
        # T2 (Tutorial)
        {"CourseCode": "T201", "CourseName": "Data Structures Tut", "CourseType": "T", "SplitIndex": 2, "WeeklyFrequency": 1, "SlotDuration": 1.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL0", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": None},
        {"CourseCode": "T202", "CourseName": "Discrete Math Tut", "CourseType": "T", "SplitIndex": 2, "WeeklyFrequency": 1, "SlotDuration": 1.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL0", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": None},
        {"CourseCode": "T203", "CourseName": "Digital Logic Tut", "CourseType": "T", "SplitIndex": 2, "WeeklyFrequency": 1, "SlotDuration": 1.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL0", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": None},
        
        # L2 (Labs) - 2 courses. Afternoon isolated (SL1).
        {"CourseCode": "L2001", "CourseName": "Data Structures Lab", "CourseType": "L", "SplitIndex": 2, "WeeklyFrequency": 1, "SlotDuration": 3.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL1", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": "SS-0"},
        {"CourseCode": "L2002", "CourseName": "OOP Lab", "CourseType": "L", "SplitIndex": 2, "WeeklyFrequency": 1, "SlotDuration": 3.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL1", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": "SS-0"},
    ])

    # Year 3: C3 = 5 courses, L3 = 4 courses, E3 = 3 courses
    # Afternoon Isolation: C3 -> SL1.
    # Morning Isolation: L3 -> SL0.
    # E3: Elective group (Year 3 electives must be split into G1-G5).
    # 1.5 hr slot max: C3 - T3 = 5 - 0 = 5. Let's make 2 use H1, 3 use H0.
    # Electives E3 can also use H1 or H0.
    courses.extend([
        # C3 (Core Theory)
        {"CourseCode": "C301", "CourseName": "Database Systems", "CourseType": "C", "SplitIndex": 3, "WeeklyFrequency": 3, "SlotDuration": 1.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL1", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": None},
        {"CourseCode": "C302", "CourseName": "Operating Systems", "CourseType": "C", "SplitIndex": 3, "WeeklyFrequency": 3, "SlotDuration": 1.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL1", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": None},
        {"CourseCode": "C303", "CourseName": "Computer Networks", "CourseType": "C", "SplitIndex": 3, "WeeklyFrequency": 3, "SlotDuration": 1.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL1", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": None},
        {"CourseCode": "C304", "CourseName": "Software Engineering", "CourseType": "C", "SplitIndex": 3, "WeeklyFrequency": 3, "SlotDuration": 1.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL1", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": None},
        {"CourseCode": "C305", "CourseName": "Theory of Computation", "CourseType": "C", "SplitIndex": 3, "WeeklyFrequency": 3, "SlotDuration": 1.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL1", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": None},
        
        # L3 (Labs) - 4 courses. Morning isolated (SL0).
        {"CourseCode": "L3001", "CourseName": "Database Systems Lab", "CourseType": "L", "SplitIndex": 3, "WeeklyFrequency": 1, "SlotDuration": 3.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL0", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": "SS-0"},
        {"CourseCode": "L3002", "CourseName": "Operating Systems Lab", "CourseType": "L", "SplitIndex": 3, "WeeklyFrequency": 1, "SlotDuration": 3.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL0", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": "SS-0"},
        {"CourseCode": "L3003", "CourseName": "Computer Networks Lab", "CourseType": "L", "SplitIndex": 3, "WeeklyFrequency": 1, "SlotDuration": 3.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL0", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": "SS-1"},
        {"CourseCode": "L3004", "CourseName": "Software Eng. Lab", "CourseType": "L", "SplitIndex": 3, "WeeklyFrequency": 1, "SlotDuration": 3.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL0", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": "SS-0"},
        
        # E3 (Electives) - 3 courses. Must be placed in G1, G2, G3...
        {"CourseCode": "E301", "CourseName": "Artificial Intelligence", "CourseType": "E", "SplitIndex": 3, "WeeklyFrequency": 3, "SlotDuration": 1.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "Any", "ElectiveGroup": "G1", "LabTiedTheoryCourse": None, "LabSessionsIndex": None},
        {"CourseCode": "E302", "CourseName": "Cloud Computing", "CourseType": "E", "SplitIndex": 3, "WeeklyFrequency": 3, "SlotDuration": 1.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "Any", "ElectiveGroup": "G2", "LabTiedTheoryCourse": None, "LabSessionsIndex": None},
        {"CourseCode": "E303", "CourseName": "Cryptography", "CourseType": "E", "SplitIndex": 3, "WeeklyFrequency": 3, "SlotDuration": 1.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "Any", "ElectiveGroup": "G3", "LabTiedTheoryCourse": None, "LabSessionsIndex": None},
    ])

    # Year 4: E4 = 1 course
    # Tying Special lab space (P) exclusively to year 4. If we want to demonstrate it, let's create a year 4 elective E401.
    courses.extend([
        {"CourseCode": "E401", "CourseName": "Advanced Machine Learning", "CourseType": "E", "SplitIndex": 4, "WeeklyFrequency": 3, "SlotDuration": 1.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "Any", "ElectiveGroup": "G4", "LabTiedTheoryCourse": None, "LabSessionsIndex": None},
    ])

    # Year 5 (MTech): C5 = 16 courses, L5 = 7 courses
    # Morning Isolation: SL0
    # 1.5 hr slot max: C5 - T5 = 16 - 0 = 16. Let's make 6 courses H1, 10 courses H0.
    for i in range(1, 17):
        code = f"C5{i:02d}"
        if i == 16:
            dur = 1.0
            conf = "H2"
            freq = 3
        else:
            dur = 1.5 if i <= 6 else 1.0
            conf = "H1" if i <= 6 else "H0"
            freq = 2 if i <= 6 else 3
        courses.append(
            {"CourseCode": code, "CourseName": f"MTech Core Course {i}", "CourseType": "C", "SplitIndex": 5, "WeeklyFrequency": freq, "SlotDuration": dur, "SlotConfigurationType": conf, "PreferredSlotCategory": "SL0", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": None}
        )
    for i in range(1, 8):
        code = f"L5{i:02d}"
        courses.append(
            {"CourseCode": code, "CourseName": f"MTech Lab {i}", "CourseType": "L", "SplitIndex": 5, "WeeklyFrequency": 1, "SlotDuration": 3.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL0", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": "SS-0"}
        )

    # Electives (E6) = 19 courses, Open Electives (E7) = 2 courses
    # E6 is Afternoon Isolated (SL1). Must be split into groups G1-G5.
    for i in range(1, 20):
        code = f"E6{i:02d}"
        # Split into groups G1 to G5
        grp = f"G{(i % 5) + 1}"
        courses.append(
            {"CourseCode": code, "CourseName": f"Elective Course {i}", "CourseType": "E", "SplitIndex": 6, "WeeklyFrequency": 3, "SlotDuration": 1.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "SL1", "ElectiveGroup": grp, "LabTiedTheoryCourse": None, "LabSessionsIndex": None}
        )
    # E7 Open Electives - limited to 12:00 or 13:00 starting times. E7 is NOT grouped.
    for i in range(1, 3):
        code = f"E7{i:02d}"
        courses.append(
            {"CourseCode": code, "CourseName": f"Open Elective {i}", "CourseType": "E", "SplitIndex": 7, "WeeklyFrequency": 3, "SlotDuration": 1.0, "SlotConfigurationType": "H0", "PreferredSlotCategory": "Any", "ElectiveGroup": None, "LabTiedTheoryCourse": None, "LabSessionsIndex": None}
        )

    # Convert to DataFrame
    df_courses = pd.DataFrame(courses)

    # ----------------------------------------------------
    # 2. RESOURCES DATASET
    # ----------------------------------------------------
    # R = Classrooms, L = Standard Labs, P = Special Labs
    resources = [
        # Classrooms (R)
        {"ResourceID": "CR101", "ResourceName": "Classroom 101", "ResourceType": "R", "Capacity": 60},
        {"ResourceID": "CR102", "ResourceName": "Classroom 102", "ResourceType": "R", "Capacity": 60},
        {"ResourceID": "CR103", "ResourceName": "Classroom 103", "ResourceType": "R", "Capacity": 120},
        {"ResourceID": "CR104", "ResourceName": "Classroom 104", "ResourceType": "R", "Capacity": 40},
        {"ResourceID": "CR105", "ResourceName": "Classroom 105", "ResourceType": "R", "Capacity": 40},
        {"ResourceID": "CR106", "ResourceName": "Classroom 106", "ResourceType": "R", "Capacity": 80},
        {"ResourceID": "CR107", "ResourceName": "Classroom 107", "ResourceType": "R", "Capacity": 80},
        {"ResourceID": "CR108", "ResourceName": "Classroom 108", "ResourceType": "R", "Capacity": 50},
        {"ResourceID": "CR109", "ResourceName": "Classroom 109", "ResourceType": "R", "Capacity": 50},
        {"ResourceID": "CR110", "ResourceName": "Classroom 110", "ResourceType": "R", "Capacity": 100},
        
        # Standard Labs (L)
        {"ResourceID": "SL201", "ResourceName": "Standard Lab 201", "ResourceType": "L", "Capacity": 40},
        {"ResourceID": "SL202", "ResourceName": "Standard Lab 202", "ResourceType": "L", "Capacity": 40},
        {"ResourceID": "SL203", "ResourceName": "Standard Lab 203", "ResourceType": "L", "Capacity": 60},
        {"ResourceID": "SL204", "ResourceName": "Standard Lab 204", "ResourceType": "L", "Capacity": 60},
        {"ResourceID": "SL205", "ResourceName": "Standard Lab 205", "ResourceType": "L", "Capacity": 30},
        {"ResourceID": "SL206", "ResourceName": "Standard Lab 206", "ResourceType": "L", "Capacity": 30},
        
        # Special Labs (P) - Tied exclusively to year 4
        {"ResourceID": "SPL401", "ResourceName": "Special Lab 401", "ResourceType": "P", "Capacity": 40},
        {"ResourceID": "SPL402", "ResourceName": "Special Lab 402", "ResourceType": "P", "Capacity": 45},
    ]
    df_resources = pd.DataFrame(resources)

    # Save to Excel
    # Save to Excel at project root dynamically
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(backend_dir)
    filename = os.path.join(project_root, "timetable_input.xlsx")
    with pd.ExcelWriter(filename, engine='openpyxl') as writer:
        df_courses.to_excel(writer, sheet_name='Courses', index=False)
        df_resources.to_excel(writer, sheet_name='Resources', index=False)

    print(f"Mock data successfully written to '{filename}'!")
    print(f"Total Courses: {len(df_courses)}")
    print(f"Total Resources: {len(df_resources)}")

if __name__ == "__main__":
    generate_mock_data()

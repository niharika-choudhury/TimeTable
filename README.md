# TimeTable
This is a GUI based flexible timetable website
# Timetable System Parameters & Mandatory Rules

## 1. System Parameters

### Slots Category
- **Morning (8:00 - 13:00):** Denote as `SL0`
- **Afternoon (14:00 - 18:00):** Denote as `SL1`

### Week Structure
- 5 Days (Monday to Friday): Denote as `D1, D2, D3, D4, D5`

### Hourly Allocation Structure
- Denote as `Hx` where:
  - `H0` = 1 hr slot
  - `H1` = 1.5 hr slot
  - `H2` = Hybrid slot
- *Note: Hybrid slots are strictly for courses with a 4-hour weekly requirement. They can consist of a mix of both 1.5 hr and 1 hr classes.*

### Slot Starting Times
- **1 hr Slots:** 8, 9, 10, 11, 12, 13, 14, 15, 16, 17
- **1.5 hr Slots:** 8, 9, 10, 11, 12, 16

### Course Classification
- **Types:** Lab (`L`), Tutorial (`T`), Theory (`C` for Core, `E` for Elective/Open Elective)
- **Year-wise Split Index:**
  - `1` = BTech 1st Year
  - `2` = BTech 2nd Year
  - `3` = BTech 3rd Year
  - `4` = BTech 4th Year
  - `5` = MTech
  - `6` = Elective
  - `7` = Open Elective
  - `8` = Any course with a 2 hr class component
  - `9` = Any course with a 4 hr class component

### Course Coding Indices
- **Theory Courses:** `C#xx` or `E#xx` (where `#` represents year levels 1-9)
- **Tutorial Courses:** `T#xx` (where `#` represents year levels 1-3. *No tutorials allowed after year level 3*)

### Detailed Component Rules

#### Theory (Core/Elective)
- **Duration:** 1 hr (Default) / 1.5 hr (Provisional)
- **Weekly Frequency:** 3/week (Default), 2/week (Provisional), or 4/week (Default for index 9 courses; can use hybrid slots)

#### Lab
- **Duration:** 2, 3, or 4 hr blocks. 3 hr is the default. 
- *Note: A 2 hr lab must always have an accompanying theory component of either 1 hr or 2 hr.*
- **Frequency:** 1/week
- **Lab Indexing System:** `L(X1)(X2)xx`
  - `X1` = Year index (1-5)
  - `X2` = Component index (`0` for general labs, `8` for 2hr lab components, `9` for 4hr lab components)
- **Lab Sessions (Nx):** High student loads can require multiple sessions. Sessions can occupy parallel slots on the same day, different days, or both. Represented via `SS-0`, `SS-1`, or `SS-2`.

#### Tutorial
- **Duration:** 1 hr
- **Frequency:** 1/week

---

## 2. Space & Course Resources

### Capacities
- `R` = Total number of available classrooms
- `L` = Total number of standard laboratories
- `P` = Total number of special lab spaces

### Active Course Count Registry
The dataset ingestion must account for the following volume of courses across indices:
- **Year 1:** `C1` = 4 courses, `L1` = 6 courses, `T1` = 1 course
- **Year 2:** `C2` = 4 courses, `L2` = 2 courses, `T2` = 3 courses
- **Year 3:** `C3` = 5 courses, `L3` = 4 courses, `E3` = 3 courses
- **Year 4:** `E4` = 1 course
- **Year 5 (MTech):** `C5` = 16 courses, `L5` = 7 courses
- **Electives & Open Electives:** `E6` = 19 courses, `E7` = 2 courses

---

## 3. Mandatory Rules (Hard Constraints)

1. **Elective Grouping:** Elective courses (excluding Open Electives) must be split into 5 distinct groups (`G1, G2, G3, G4, G5`). Each group shares a common, fully synchronized schedule.
2. **Lab Ties & Allocations:** Labs with index components 0 and 9 are independent entities. Labs with an index component of 8 are strictly tied entities to a matching theory course of index 8. Special lab space allocation (`P`) is tied exclusively to year index 4.
3. **Open Elective (E7) Limits:** `E7` courses are structurally limited. They can only be assigned to 1-hour slots starting at either 12:00 or 13:00.
4. **Afternoon Isolation (SL1):** All courses belonging to `C3`, `E6`, and `L2` must be placed entirely within the Afternoon slot category (`SL1`).
5. **Morning Isolation (SL0):** All courses belonging to `C1`, `C2`, `C5`, `L1`, `L3`, and `L5` must be placed entirely within the Morning slot category (`SL0`).
6. **Daily Theory Cap:** Any single theory course can have a maximum of 1 session per day.
7. **1.5 hr Slot Maximum Formula:** The maximum number of courses globally permitted to use a 1.5-hour slot configuration (`H1`) is bounded by the calculation: `C# - T#`.
8. **Tutorial Slot Isolation:** Tutorials (`T#xx`) are strictly limited to the following 1-hour slots: 08:00 - 09:00 or 17:00 - 18:00.
9. **Exclusion Constraint:** No `C4` or `T4` courses exist within the system parameters. Any entry matching this criteria must be rejected.

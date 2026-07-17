import { useState, useEffect, useRef } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import {
  Upload, Info, AlertTriangle, CheckCircle, Play,
  Calendar, Clock, Database, BookOpen, Layers,
  RefreshCw, ShieldAlert, Cpu, Award, MapPin, Grid,
  Menu, X
} from 'lucide-react'

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
const TIME_SLOTS = [
  { tick: 0, label: "08:00 – 09:00", cat: "SL0" },
  { tick: 2, label: "09:00 – 10:00", cat: "SL0" },
  { tick: 4, label: "10:00 – 11:00", cat: "SL0" },
  { tick: 6, label: "11:00 – 12:00", cat: "SL0" },
  { tick: 8, label: "12:00 – 13:00", cat: "SL0" },
  { tick: 10, label: "13:00 – 14:00", cat: "SL0" },
  { tick: 12, label: "14:00 – 15:00", cat: "SL1" },
  { tick: 14, label: "15:00 – 16:00", cat: "SL1" },
  { tick: 16, label: "16:00 – 17:00", cat: "SL1" },
  { tick: 18, label: "17:00 – 18:00", cat: "SL1" },
  { tick: 20, label: "18:00 – 19:00", cat: "SL1" }
]

// CP-SAT scheduling system parameters matching solver.py
const TUTORIAL_STARTS = [0, 18]
const E7_STARTS = [8, 10]
const STARTS_H1 = [0, 2, 4, 6, 8, 16, 18, 20]
const STARTS_H0 = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]
const SL0_MAX_START_TICK = 10
const SL1_MIN_START_TICK = 12
const SL1_MAX_START_TICK = 20
const TICKS_PER_DAY = 24

function App() {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)

  // Data lists from Excel upload
  const [courses, setCourses] = useState([])
  const [resources, setResources] = useState([])

  // Current timetable layout state
  const [timetable, setTimetable] = useState([])
  const [unassignedCourses, setUnassignedCourses] = useState([])
  const [conflicts, setConflicts] = useState({})

  // Drag state for highlighting valid grid slots
  const [draggedSession, setDraggedSession] = useState(null)
  const [stats, setStats] = useState(null)

  // Dark Mode State Logic
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark'
  })

  const [token, setToken] = useState(() => localStorage.getItem('token'))

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [selectedDayIndex, setSelectedDayIndex] = useState(0)
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false)
  const [toasts, setToasts] = useState([])
  const [isLargeScreen, setIsLargeScreen] = useState(() => {
    return typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleResize = () => {
      setIsLargeScreen(window.innerWidth >= 1024)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (isLargeScreen) {
      setMobileMenuOpen(false)
    }
  }, [isLargeScreen])

  const handleLogout = () => {
    localStorage.removeItem('token')
    setToken(null)
  }

  useEffect(() => {
    const root = window.document.documentElement
    if (darkMode) {
      root.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      root.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [darkMode])

  const BACKEND_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '')

  const prevConflictsCountRef = useRef(0)

  // Update conflicts whenever the timetable changes
  useEffect(() => {
    if (timetable.length > 0 || unassignedCourses.length > 0) {
      const map = detectConflicts(timetable)
      setConflicts(map)
      
      const totalConflicts = Object.values(map).reduce((acc, list) => acc + list.length, 0)
      if (totalConflicts > prevConflictsCountRef.current) {
        showToast('Conflict Warning: Allocated session causes overlap or resource clash!', 'error')
      } else if (totalConflicts < prevConflictsCountRef.current && totalConflicts === 0) {
        showToast('All conflicts resolved successfully!', 'success')
      }
      prevConflictsCountRef.current = totalConflicts
    } else {
      setConflicts({})
      prevConflictsCountRef.current = 0
    }
  }, [timetable, unassignedCourses])

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setError(null)
      setSuccessMessage(null)
    }
  }

  const handleGenerateMock = async () => {
    setLoading(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const res = await fetch(`${BACKEND_URL}/api/generate-mock`, { 
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      const result = await res.json()
      if (res.ok) {
        setSuccessMessage(result.message)
        showToast('Mock data generated successfully!', 'success')
      } else {
        setError(result.detail || 'Failed to generate mock data.')
        showToast(result.detail || 'Failed to generate mock data.', 'error')
      }
    } catch (err) {
      setError('Connection error. Is the backend server running?')
      showToast('Connection error. Is the backend server running?', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Parse Excel sheets and populate unassigned courses
  const handleUpload = async (e) => {
    e.preventDefault()
    if (!file) {
      setError('Please select an Excel file first.')
      return
    }

    setLoading(true)
    setError(null)
    setSuccessMessage(null)
    setTimetable([])
    setUnassignedCourses([])
    setStats(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`${BACKEND_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
      })
      const result = await res.json()
      if (res.ok) {
        setSuccessMessage('File parsed and validated successfully!')
        showToast('Excel spreadsheet parsed and loaded!', 'success')
        setCourses(result.data.courses)
        setResources(result.data.resources)

        // Generate sessions that are initially unassigned
        const expanded = []
        result.data.courses.forEach(c => {
          let numInstances = 1
          if (c.CourseType === 'L') {
            if (c.LabSessionsIndex === 'SS-0' || c.LabSessionsIndex === 'SS-1') numInstances = 2
            else if (c.LabSessionsIndex === 'SS-2') numInstances = 3
          }

          // Parse X1, X2 for Labs to determine duration
          let x1 = null, x2 = null
          if (c.CourseType === 'L') {
            const match = c.CourseCode.match(/^L([1-5])([089])\d+$/i)
            if (match) {
              x1 = parseInt(match[1])
              x2 = parseInt(match[2])
            }
          }
          const labDur = (x2 === 0) ? 3.0 : (x2 === 8 ? 2.0 : 4.0)
          const baseDur = c.CourseType === 'L' ? labDur : c.SlotDuration

          for (let instIdx = 0; instIdx < numInstances; instIdx++) {
            for (let sIdx = 0; sIdx < c.WeeklyFrequency; sIdx++) {
              // H2 dynamically splits into two 1.5 hr and one 1.0 hr sessions
              const sDur = (c.SlotConfigurationType === 'H2' && sIdx < 2) ? 1.5 : (c.SlotConfigurationType === 'H2' ? 1.0 : baseDur)

              expanded.push({
                id: `${c.CourseCode}_I${instIdx}_S${sIdx}`,
                CourseCode: c.CourseCode,
                CourseName: c.CourseName,
                CourseType: c.CourseType,
                SplitIndex: c.SplitIndex,
                SessionIndex: sIdx,
                InstanceIndex: instIdx,
                Duration: sDur,
                PreferredSlotCategory: c.PreferredSlotCategory,
                ElectiveGroup: c.ElectiveGroup,
                LabTiedTheoryCourse: c.LabTiedTheoryCourse,
                LabSessionsIndex: c.LabSessionsIndex,
                DayIndex: null,
                StartTick: null,
                RoomID: null
              })
            }
          }
        })

        setUnassignedCourses(expanded)
      } else {
        setError(result.detail || 'Validation failed.')
        showToast(result.detail || 'Excel validation failed.', 'error')
      }
    } catch (err) {
      setError('Connection error. Is the backend server running?')
      showToast('Connection error. Is the backend server running?', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Load Excel workbook directly from backend server filesystem
  const handleLoadServerExcel = async () => {
    setLoading(true)
    setError(null)
    setSuccessMessage(null)
    setTimetable([])
    setUnassignedCourses([])
    setStats(null)

    try {
      const res = await fetch(`${BACKEND_URL}/api/load-server-excel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      const result = await res.json()
      if (res.ok) {
        setSuccessMessage('Successfully loaded default dataset directly from server!')
        showToast('Default dataset loaded from server!', 'success')
        setCourses(result.data.courses)
        setResources(result.data.resources)

        const expanded = []
        result.data.courses.forEach(c => {
          let numInstances = 1
          if (c.CourseType === 'L') {
            if (c.LabSessionsIndex === 'SS-0' || c.LabSessionsIndex === 'SS-1') numInstances = 2
            else if (c.LabSessionsIndex === 'SS-2') numInstances = 3
          }

          let x1 = null, x2 = null
          if (c.CourseType === 'L') {
            const match = c.CourseCode.match(/^L([1-5])([089])\d+$/i)
            if (match) {
              x1 = parseInt(match[1])
              x2 = parseInt(match[2])
            }
          }
          const labDur = (x2 === 0) ? 3.0 : (x2 === 8 ? 2.0 : 4.0)
          const baseDur = c.CourseType === 'L' ? labDur : c.SlotDuration

          for (let instIdx = 0; instIdx < numInstances; instIdx++) {
            for (let sIdx = 0; sIdx < c.WeeklyFrequency; sIdx++) {
              const sDur = (c.SlotConfigurationType === 'H2' && sIdx < 2) ? 1.5 : (c.SlotConfigurationType === 'H2' ? 1.0 : baseDur)

              expanded.push({
                id: `${c.CourseCode}_I${instIdx}_S${sIdx}`,
                CourseCode: c.CourseCode,
                CourseName: c.CourseName,
                CourseType: c.CourseType,
                SplitIndex: c.SplitIndex,
                SessionIndex: sIdx,
                InstanceIndex: instIdx,
                Duration: sDur,
                PreferredSlotCategory: c.PreferredSlotCategory,
                ElectiveGroup: c.ElectiveGroup,
                LabTiedTheoryCourse: c.LabTiedTheoryCourse,
                LabSessionsIndex: c.LabSessionsIndex,
                DayIndex: null,
                StartTick: null,
                RoomID: null
              })
            }
          }
        })

        setUnassignedCourses(expanded)
      } else {
        setError(result.detail || 'Failed to load server Excel sheet.')
        showToast(result.detail || 'Failed to load server dataset.', 'error')
      }
    } catch (err) {
      setError('Connection error. Is the backend server running?')
      showToast('Connection error. Is the backend server running?', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Run CP-SAT Solver to auto-schedule everything
  const handleAutoSchedule = async () => {
    if (!file && courses.length === 0) {
      setError('Please upload a dataset file or click "Load Dataset from Server" first.')
      return
    }

    setLoading(true)
    setError(null)
    setSuccessMessage(null)
    setTimetable([])
    setUnassignedCourses([])

    try {
      let res
      if (file) {
        const formData = new FormData()
        formData.append('file', file)
        res = await fetch(`${BACKEND_URL}/api/schedule/generate`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData,
        })
      } else {
        res = await fetch(`${BACKEND_URL}/api/schedule/generate-direct`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
      }
      const result = await res.json()
      if (res.ok && result.status === 'success') {
        setSuccessMessage(result.message)
        showToast('Auto-Schedule compiled successfully!', 'success')

        // Map backend output format to frontend sessions
        const assigned = result.timetable.map((t) => ({
          id: `${t.CourseCode}_I${t.InstanceIndex}_S${t.SessionIndex}`,
          CourseCode: t.CourseCode,
          CourseName: t.CourseName,
          CourseType: t.CourseType,
          SplitIndex: getSplitIndexFromCode(t.CourseCode),
          SessionIndex: t.SessionIndex,
          InstanceIndex: t.InstanceIndex,
          Duration: t.Duration,
          PreferredSlotCategory: getPreferredSlotFromCode(t.CourseCode),
          ElectiveGroup: t.ElectiveGroup,
          LabTiedTheoryCourse: getTiedTheoryFromCode(t.CourseCode),
          LabSessionsIndex: getSessionsIndexFromCode(t.CourseCode, result.timetable),
          DayIndex: t.DayIndex,
          Day: t.Day,
          StartTick: t.StartTick,
          RoomID: t.RoomID
        }))

        setTimetable(assigned)
        setUnassignedCourses([])
        setStats(result.stats)
      } else {
        setError(result.errors ? result.errors.join('\n') : 'Scheduling failed.')
        showToast('Scheduling failed. Check logs.', 'error')
      }
    } catch (err) {
      setError('Connection error. Is the backend server running?')
      showToast('Connection error. Is the backend server running?', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Helper parsing from code mapping
  const getSplitIndexFromCode = (code) => {
    if (code.startsWith('C8')) return 8
    const match = code.match(/[C|T|L|E](\d)/)
    return match ? parseInt(match[1]) : 1
  }

  const getPreferredSlotFromCode = (code) => {
    if (anyStartWith(code, ["C1", "C2", "C5", "L1", "L3", "L5", "C8"])) return "SL0"
    if (anyStartWith(code, ["C3", "E6", "L2"])) return "SL1"
    return "Any"
  }

  const getTiedTheoryFromCode = (code) => {
    if (code.startsWith('L18')) return 'C801'
    return null
  }

  const getSessionsIndexFromCode = (code, timetableList) => {
    // Determine session count spawned to map SS style
    const count = timetableList.filter(t => t.CourseCode === code && t.SessionIndex === 0).length
    if (count === 3) return 'SS-2'
    if (count === 2) {
      // Differentiate SS-0 (parallel) and SS-1 (different days)
      const list = timetableList.filter(t => t.CourseCode === code && t.SessionIndex === 0)
      if (list[0]?.DayIndex === list[1]?.DayIndex) return 'SS-0'
      return 'SS-1'
    }
    return 'SS-0'
  }

  const anyStartWith = (str, prefixes) => prefixes.some(p => str.startsWith(p))

  // Check cell slot constraints based on RULES.md
  const isValidCell = (session, dayIndex, startTick) => {
    const code = session.CourseCode
    const ctype = session.CourseType
    const dur = session.Duration
    const span = Math.round(dur * 2)
    const slot_cat = session.PreferredSlotCategory

    let allowedStarts = []
    if (ctype === 'T') {
      allowedStarts = [...TUTORIAL_STARTS]
    } else if (code.startsWith('E7')) {
      allowedStarts = [...E7_STARTS]
    } else if (dur === 1.5) {
      allowedStarts = [...STARTS_H1]
    } else if (dur === 1.0) {
      allowedStarts = [...STARTS_H0]
    } else {
      // Labs can start on hourly boundaries
      for (let t = 0; t <= TICKS_PER_DAY - span; t += 2) {
        allowedStarts.push(t)
      }
    }

    // Morning (SL0 max start 13:00) and Afternoon (SL1 max start 18:00) cutoffs
    if (slot_cat === 'SL0') {
      allowedStarts = allowedStarts.filter(t => t <= SL0_MAX_START_TICK)
    } else if (slot_cat === 'SL1') {
      allowedStarts = allowedStarts.filter(t => t >= SL1_MIN_START_TICK && t <= SL1_MAX_START_TICK)
    }

    // Fit within single day
    allowedStarts = allowedStarts.filter(t => t + span <= TICKS_PER_DAY)
    return allowedStarts.includes(startTick)
  }

  // Automatically find a free room or default first available
  const autoAssignRoom = (session, dayIndex, startTick, currentTimetable) => {
    const ctype = session.CourseType
    const code = session.CourseCode
    const dur = session.Duration
    const span = Math.round(dur * 2)

    // Routing special room P for Year 4 labs
    let x1 = null
    if (ctype === 'L') {
      const match = code.match(/^L([1-5])/)
      if (match) x1 = parseInt(match[1])
    }

    let pool = []
    if (ctype === 'L') {
      if (x1 === 4) {
        pool = resources.filter(r => r.ResourceType === 'P')
      } else {
        pool = resources.filter(r => r.ResourceType === 'L')
      }
    } else {
      pool = resources.filter(r => r.ResourceType === 'R')
    }

    if (pool.length === 0) return 'Unassigned'

    for (const room of pool) {
      const rid = room.ResourceID
      const hasOverlap = currentTimetable.some(other => {
        if (other.id === session.id) return false
        if (other.RoomID !== rid || other.DayIndex !== dayIndex) return false

        const otherSpan = Math.round(other.Duration * 2)
        const otherStart = other.StartTick
        return (startTick < otherStart + otherSpan) && (otherStart < startTick + span)
      })

      if (!hasOverlap) return rid
    }

    return pool[0]?.ResourceID || 'Unassigned'
  }

  // Real-time frontend validator
  const detectConflicts = (currentTimetable) => {
    const map = {}
    currentTimetable.forEach(s => {
      map[s.id] = []
    })

    const getLabIndices = (code) => {
      const match = code.match(/^L([1-5])([089])\d+$/i)
      return match ? { x1: parseInt(match[1]), x2: parseInt(match[2]) } : { x1: null, x2: null }
    }

    // 1. Room Overlaps
    for (let i = 0; i < currentTimetable.length; i++) {
      for (let j = i + 1; j < currentTimetable.length; j++) {
        const s1 = currentTimetable[i]
        const s2 = currentTimetable[j]
        if (s1.DayIndex === s2.DayIndex && s1.RoomID === s2.RoomID && s1.RoomID !== 'Unassigned' && s1.RoomID !== null) {
          const span1 = Math.round(s1.Duration * 2)
          const span2 = Math.round(s2.Duration * 2)
          if (s1.StartTick < s2.StartTick + span2 && s2.StartTick < s1.StartTick + span1) {
            map[s1.id].push(`Room double-booking with ${s2.CourseCode}`)
            map[s2.id].push(`Room double-booking with ${s1.CourseCode}`)
          }
        }
      }
    }

    // 2. Cohort Overlaps (BTech Years 1-3)
    for (let i = 0; i < currentTimetable.length; i++) {
      for (let j = i + 1; j < currentTimetable.length; j++) {
        const s1 = currentTimetable[i]
        const s2 = currentTimetable[j]
        if (s1.DayIndex === s2.DayIndex) {
          const c1 = getCohort(s1)
          const c2 = getCohort(s2)

          if (c1 && c2 && c1 === c2) {
            const isY3Elec1 = s1.CourseCode.startsWith('E3') && s1.ElectiveGroup
            const isY3Elec2 = s2.CourseCode.startsWith('E3') && s2.ElectiveGroup
            if (isY3Elec1 && isY3Elec2 && s1.ElectiveGroup !== s2.ElectiveGroup) {
              continue
            }

            const span1 = Math.round(s1.Duration * 2)
            const span2 = Math.round(s2.Duration * 2)
            if (s1.StartTick < s2.StartTick + span2 && s2.StartTick < s1.StartTick + span1) {
              map[s1.id].push(`Cohort overlap with ${s2.CourseCode}`)
              map[s2.id].push(`Cohort overlap with ${s1.CourseCode}`)
            }
          }
        }
      }
    }

    function getCohort(s) {
      const code = s.CourseCode
      const split = s.SplitIndex
      if (code.startsWith('L')) return null
      if (code.startsWith('C5') || code.startsWith('T5') || code.startsWith('L5') || split === 5) return null
      for (let y of [1, 2, 3, 4]) {
        const prefixes = [`C${y}`, `T${y}`, `E${y}`]
        if (prefixes.some(p => code.startsWith(p))) return y
      }
      if (split === 8) return 1
      return null
    }

    // 3. Daily Theory Cap
    const courseDaySessions = {}
    currentTimetable.forEach(s => {
      if (s.CourseType === 'C' || s.CourseType === 'E') {
        const code = s.CourseCode
        if (!courseDaySessions[code]) courseDaySessions[code] = {}
        if (!courseDaySessions[code][s.DayIndex]) courseDaySessions[code][s.DayIndex] = 0
        courseDaySessions[code][s.DayIndex]++

        if (courseDaySessions[code][s.DayIndex] > 1) {
          map[s.id].push(`Daily theory cap exceeded (${s.CourseCode})`)
        }
      }
    })

    // 4. Lab Ties (X2=8)
    currentTimetable.forEach(s => {
      if (s.CourseType === 'L') {
        const { x2 } = getLabIndices(s.CourseCode)
        if (x2 === 8 && s.LabTiedTheoryCourse) {
          const tiedCode = s.LabTiedTheoryCourse
          const tiedSessions = currentTimetable.filter(o => o.CourseCode === tiedCode)
          if (tiedSessions.length > 0) {
            const sameDay = tiedSessions.some(o => o.DayIndex === s.DayIndex)
            if (!sameDay) {
              map[s.id].push(`Lab must share day with tied theory ${tiedCode}`)
            }
          } else {
            map[s.id].push(`Tied theory course ${tiedCode} is unallocated!`)
          }
        }
      }
    })

    // 5. Multi-Session Split Styles (SS-0 parallel vs SS-1 separate days)
    const labsByCode = {}
    currentTimetable.forEach(s => {
      if (s.CourseType === 'L') {
        if (!labsByCode[s.CourseCode]) labsByCode[s.CourseCode] = []
        labsByCode[s.CourseCode].push(s)
      }
    })

    Object.entries(labsByCode).forEach(([code, list]) => {
      if (list.length <= 1) return
      const style = list[0].LabSessionsIndex

      if (style === 'SS-0') {
        const first = list[0]
        list.forEach(item => {
          if (item.DayIndex !== first.DayIndex || item.StartTick !== first.StartTick) {
            map[item.id].push(`Parallel lab mismatch: SS-0 sessions must share day & time`)
          }
        })
      } else if (style === 'SS-1') {
        const daysSeen = {}
        list.forEach(item => {
          if (item.DayIndex !== null) {
            if (daysSeen[item.DayIndex]) {
              map[item.id].push(`Separate day violation: SS-1 sessions must occupy different days`)
            }
            daysSeen[item.DayIndex] = true
          }
        })
      }
    })

    // 6. Physical Capacity Room Routing (Year 4 -> P, standard labs -> L)
    currentTimetable.forEach(s => {
      if (s.RoomID && s.RoomID !== 'Unassigned' && s.RoomID !== '?') {
        const room = resources.find(r => r.ResourceID === s.RoomID)
        const rtype = room ? room.ResourceType : null

        if (s.CourseType === 'L') {
          const { x1 } = getLabIndices(s.CourseCode)
          if (x1 === 4) {
            if (rtype !== 'P') {
              map[s.id].push(`Special space violation: Year 4 lab must use Special Lab (P)`)
            }
          } else {
            if (rtype !== 'L') {
              map[s.id].push(`Lab space violation: standard lab must use Standard Lab (L)`)
            }
          }
        } else {
          if (rtype !== 'R') {
            map[s.id].push(`Classroom violation: theory/tutorials must use Classrooms (R)`)
          }
        }
      }
    })

    // 7. Preferred Category Isolation Cutoffs
    currentTimetable.forEach(s => {
      const cat = s.PreferredSlotCategory
      const start = s.StartTick
      if (cat === 'SL0' && start > SL0_MAX_START_TICK) {
        map[s.id].push(`Placed in SL1 afternoon, prefers SL0 (Morning start <= 13:00)`)
      } else if (cat === 'SL1' && (start < SL1_MIN_START_TICK || start > SL1_MAX_START_TICK)) {
        map[s.id].push(`Placed in SL0 morning, prefers SL1 (Afternoon start 14:00-18:00)`)
      }
    })

    // 8. Tutorials Check
    currentTimetable.forEach(s => {
      if (s.CourseType === 'T' && s.StartTick !== 0 && s.StartTick !== 18) {
        map[s.id].push(`Tutorials must start at 08:00 (tick 0) or 17:00 (tick 18)`)
      }
    })

    // 9. E7 Open Elective Check
    currentTimetable.forEach(s => {
      if (s.CourseCode.startsWith('E7') && s.StartTick !== 8 && s.StartTick !== 10) {
        map[s.id].push(`Open Elective E7 must start at 12:00 (tick 8) or 13:00 (tick 10)`)
      }
    })

    return map
  }

  // Hello Pangea DnD mechanics
  const onDragStart = (start) => {
    const sId = start.draggableId
    const session = timetable.find(s => s.id === sId) || unassignedCourses.find(s => s.id === sId)
    setDraggedSession(session)
  }

  const onDragEnd = (result) => {
    setDraggedSession(null)
    const { source, destination, draggableId } = result

    if (!destination) return

    if (destination.droppableId === 'unassigned') {
      const moved = timetable.find(s => s.id === draggableId)
      if (moved) {
        setTimetable(timetable.filter(s => s.id !== draggableId))
        setUnassignedCourses([...unassignedCourses, {
          ...moved,
          DayIndex: null,
          Day: null,
          StartTick: null,
          RoomID: null
        }])
      }
      return
    }

    const match = destination.droppableId.match(/^cell_(\d+)_(\d+)$/)
    if (!match) return
    const destDay = parseInt(match[1])
    const destTick = parseInt(match[2])

    const session = timetable.find(s => s.id === draggableId) || unassignedCourses.find(s => s.id === draggableId)
    if (!session) return

    if (!isValidCell(session, destDay, destTick)) return

    const nextRoom = autoAssignRoom(session, destDay, destTick, timetable)
    const updatedSession = {
      ...session,
      DayIndex: destDay,
      Day: DAY_NAMES[destDay],
      StartTick: destTick,
      RoomID: nextRoom
    }

    if (source.droppableId === 'unassigned') {
      setUnassignedCourses(unassignedCourses.filter(s => s.id !== draggableId))
      setTimetable([...timetable, updatedSession])
    } else {
      setTimetable(timetable.map(s => s.id === draggableId ? updatedSession : s))
    }
  }

  const handleRoomChange = (sId, nextRoom) => {
    setTimetable(timetable.map(s => s.id === sId ? { ...s, RoomID: nextRoom } : s))
  }

  const getRoomPool = (session) => {
    const ctype = session.CourseType
    const code = session.CourseCode
    let x1 = null
    if (ctype === 'L') {
      const match = code.match(/^L([1-5])/)
      if (match) x1 = parseInt(match[1])
    }

    if (ctype === 'L') {
      return x1 === 4
        ? resources.filter(r => r.ResourceType === 'P')
        : resources.filter(r => r.ResourceType === 'L')
    }
    return resources.filter(r => r.ResourceType === 'R')
  }

  const getWarningsCount = () => {
    return Object.values(conflicts).reduce((acc, list) => acc + list.length, 0)
  }

  const showToast = (message, type = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }

  const exportToCSV = (timetableList) => {
    if (timetableList.length === 0) {
      alert("No scheduled sessions to export!")
      return
    }
    const headers = ["Course Code", "Course Name", "Type", "Day", "Time Slot", "Duration (hrs)", "Room ID", "Elective Group"]
    const rows = timetableList.map(s => [
      `"${s.CourseCode}"`,
      `"${s.CourseName}"`,
      `"${s.CourseType}"`,
      `"${s.Day || DAY_NAMES[s.DayIndex]}"`,
      `"${TIME_SLOTS.find(slot => slot.tick === s.StartTick)?.label || ''}"`,
      `"${s.Duration}"`,
      `"${s.RoomID || 'Unassigned'}"`,
      `"${s.ElectiveGroup || ''}"`
    ])
    
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n")
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.setAttribute("download", "timetable_export.csv")
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showToast('Timetable exported to Excel (CSV) successfully!', 'success')
  }

  const exportToICal = (timetableList) => {
    if (timetableList.length === 0) {
      alert("No scheduled sessions to export!")
      return
    }
    
    const baseYear = 2026
    const baseMonth = 7 // July
    const baseDay = 20
    
    let icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//OptimaScheduler//Academic Calendar//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH"
    ]
    
    timetableList.forEach((s) => {
      const dayOffset = s.DayIndex !== null ? s.DayIndex : 0
      
      const eventDate = new Date(baseYear, baseMonth - 1, baseDay + dayOffset)
      const yr = eventDate.getFullYear()
      const mo = String(eventDate.getMonth() + 1).padStart(2, '0')
      const dy = String(eventDate.getDate()).padStart(2, '0')
      
      const startHour = 8 + Math.floor(s.StartTick / 2)
      const startMin = (s.StartTick % 2) * 30
      
      const totalMinutes = startHour * 60 + startMin + s.Duration * 60
      const endHour = Math.floor(totalMinutes / 60)
      const endMin = Math.round(totalMinutes % 60)
      
      const tStart = `${yr}${mo}${dy}T${String(startHour).padStart(2, '0')}${String(startMin).padStart(2, '0')}00`
      const tEnd = `${yr}${mo}${dy}T${String(endHour).padStart(2, '0')}${String(endMin).padStart(2, '0')}00`
      const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"
      const uid = `${s.id}_${yr}${mo}${dy}@optimascheduler.internal`
      
      icsContent.push(
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=Asia/Kolkata:${tStart}`,
        `DTEND;TZID=Asia/Kolkata:${tEnd}`,
        `SUMMARY:${s.CourseCode} - ${s.CourseName}`,
        `DESCRIPTION:Type: ${s.CourseType === 'C' ? 'Core' : s.CourseType === 'L' ? 'Lab' : s.CourseType === 'T' ? 'Tutorial' : 'Elective'}\\nRoom: ${s.RoomID || 'Unassigned'}\\nDuration: ${s.Duration} hr`,
        `LOCATION:${s.RoomID || 'Unassigned'}`,
        "RRULE:FREQ=WEEKLY;UNTIL=20261215T235959Z",
        "END:VEVENT"
      )
    })
    
    icsContent.push("END:VCALENDAR")
    
    const blob = new Blob([icsContent.join("\r\n")], { type: 'text/calendar;charset=utf-8;' })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.setAttribute("download", "timetable_calendar.ics")
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showToast('Timetable calendar (.ics) exported successfully!', 'success')
  }

  const exportToPDF = (timetableList) => {
    if (timetableList.length === 0) {
      alert("No scheduled sessions to export!")
      return
    }

    const printWindow = window.open("", "_blank")
    if (!printWindow) {
      alert("Popup blocker blocked the printable view! Please allow popups.")
      return
    }
    showToast('Opening printable weekly PDF schedule...', 'info')

    let gridHTML = ""
    TIME_SLOTS.forEach(slot => {
      let rowHTML = `<tr><td class="time-col"><strong>${slot.label}</strong><br/><span class="cat-label">${slot.cat === 'SL0' ? 'Morning' : 'Afternoon'}</span></td>`
      DAY_NAMES.forEach((day, dIdx) => {
        const sessions = timetableList.filter(s => s.DayIndex === dIdx && s.StartTick === slot.tick)
        let cellContent = ""
        if (sessions.length > 0) {
          sessions.forEach(s => {
            const typeofCore = s.CourseType === 'C'
            const typeofLab = s.CourseType === 'L'
            const typeofElec = s.CourseType === 'E'
            const cardBg = typeofCore ? '#e2eaf1' : typeofLab ? '#f7e7e5' : typeofElec ? '#f3ebf5' : '#faf3e6'
            const borderCol = typeofCore ? '#cbdceb' : typeofLab ? '#f1d4d0' : typeofElec ? '#e4d7e5' : '#ecdcc4'
            
            cellContent += `
              <div class="session-card" style="background: ${cardBg}; border: 1px solid ${borderCol};">
                <div class="card-header">
                  <span class="code">${s.CourseCode}</span>
                  <span class="type-badge">${s.CourseType === 'C' ? 'Core' : s.CourseType === 'L' ? 'Lab' : s.CourseType === 'T' ? 'Tut' : 'Elec'}</span>
                </div>
                <div class="name">${s.CourseName}</div>
                <div class="footer-info">Room: ${s.RoomID || 'Unassigned'} | ${s.Duration} hr</div>
              </div>
            `
          })
        }
        rowHTML += `<td>${cellContent}</td>`
      })
      rowHTML += `</tr>`
      gridHTML += rowHTML
    })

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Weekly Timetable Print View</title>
        <style>
          body {
            font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
            margin: 20px;
            color: #333;
            background-color: #fff;
          }
          .header {
            text-align: center;
            margin-bottom: 20px;
            border-bottom: 2px solid #cbdceb;
            padding-bottom: 15px;
          }
          .header h1 {
            margin: 0 0 5px 0;
            font-size: 22px;
            color: #1e2d3d;
          }
          .header p {
            margin: 0;
            font-size: 12px;
            color: #5a6d82;
            font-weight: 500;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
          }
          th, td {
            border: 1px solid #cbdceb;
            padding: 8px;
            vertical-align: top;
            text-align: left;
            font-size: 11px;
          }
          th {
            background-color: #f8fafc;
            color: #333a42;
            font-weight: bold;
            text-transform: uppercase;
            font-size: 10px;
            letter-spacing: 0.5px;
            text-align: center;
          }
          .time-col {
            width: 90px;
            text-align: center;
            background-color: #f8fafc;
          }
          .cat-label {
            font-size: 8px;
            font-weight: bold;
            color: #718096;
            text-transform: uppercase;
          }
          .session-card {
            border-radius: 6px;
            padding: 6px;
            margin-bottom: 4px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.05);
          }
          .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
          }
          .code {
            font-family: monospace;
            font-weight: bold;
            font-size: 10px;
            color: #2a3b4c;
          }
          .type-badge {
            font-size: 7px;
            font-weight: 800;
            text-transform: uppercase;
            color: #718096;
          }
          .name {
            font-weight: 700;
            font-size: 10px;
            color: #1a202c;
            margin-bottom: 4px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .footer-info {
            font-size: 8px;
            color: #718096;
            font-weight: 500;
          }
          @media print {
            body { margin: 10px; }
            @page { size: landscape; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Weekly Timetable Schedule</h1>
          <p>Generated on ${new Date().toLocaleDateString()} | Optimized by FastAPI + CP-SAT Solver</p>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 90px;">Time Slot</th>
              ${DAY_NAMES.map(d => `<th>${d}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${gridHTML}
          </tbody>
        </table>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
              window.close();
            }, 350);
          }
        </script>
      </body>
      </html>
    `)
    printWindow.document.close()
  }

  const renderIngestionPanel = () => (
    <div className="bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm">
      <h3 className="font-bold text-sm text-[#333A42] dark:text-slate-200 mb-3 flex items-center gap-2 uppercase tracking-wide border-b border-slate-100 dark:border-slate-800 pb-2">
        <Upload className="w-4 h-4 text-[#4A607A] dark:text-indigo-400" />
        Excel Dataset Ingestion
      </h3>

      <form onSubmit={handleUpload} className="space-y-3">
        <div className="border border-dashed border-slate-300 dark:border-slate-700 hover:border-[#A9C2D9] dark:hover:border-indigo-500/50 rounded-xl p-5 text-center cursor-pointer bg-slate-50/50 dark:bg-slate-950/40 transition relative group">
          <input
            type="file"
            accept=".xlsx"
            onChange={handleFileChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <Clock className="w-6 h-6 text-slate-400 mx-auto mb-2 group-hover:text-[#4A607A] dark:group-hover:text-indigo-400 transition" />
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 block">
            {file ? file.name : 'Select timetable_input.xlsx'}
          </span>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading || !file}
            className="flex-1 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold py-2.5 px-3 rounded-xl text-xs border border-slate-300/60 dark:border-slate-700 shadow-sm transition disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1.5 min-h-[40px]"
          >
            {loading && <RefreshCw className="w-3 h-3 animate-spin" />}
            Parse File
          </button>

          <button
            type="button"
            onClick={handleLoadServerExcel}
            disabled={loading}
            className="flex-1 bg-[#A9C2D9] dark:bg-indigo-650/80 hover:bg-[#94B0CB] dark:hover:bg-indigo-600 text-[#1E2D3D] dark:text-white font-bold py-2.5 px-3 rounded-xl text-xs shadow-sm transition disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1.5 min-h-[40px]"
          >
            {loading && <RefreshCw className="w-3 h-3 animate-spin" />}
            Load from Server
          </button>
        </div>
      </form>
    </div>
  )

  const renderUnassignedPool = () => (
    <div className="bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm flex flex-col h-[540px]">
      <h3 className="font-bold text-sm text-[#333A42] dark:text-slate-200 mb-3 flex items-center gap-2 uppercase tracking-wide border-b border-slate-100 dark:border-slate-800 pb-2">
        <BookOpen className="w-4 h-4 text-[#7D5A80] dark:text-purple-400" />
        Unassigned Pool
      </h3>

      <Droppable droppableId="unassigned" direction="vertical">
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 overflow-y-auto space-y-3 rounded-xl pr-1 transition-colors ${snapshot.isDraggingOver ? 'bg-slate-50 dark:bg-slate-900/30' : ''}`}
          >
            {unassignedCourses.length > 0 ? (
              unassignedCourses.map((s, idx) => (
                <SessionCard key={s.id} session={s} index={idx} conflicts={conflicts[s.id]} />
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 text-center p-4">
                <Grid className="w-8 h-8 mb-2 opacity-30 text-slate-300" />
                <span className="text-xs font-medium">No unassigned courses</span>
              </div>
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  )

  if (!token) {
    return (
      <AuthForm 
        token={token} 
        setToken={setToken} 
        darkMode={darkMode} 
        setDarkMode={setDarkMode}
        BACKEND_URL={BACKEND_URL}
        showToast={showToast}
      />
    )
  }

  return (
    <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="min-h-screen bg-[#F0F4F8] text-[#333A42] dark:bg-slate-950 dark:text-slate-100 font-sans relative overflow-x-hidden transition-colors duration-200 selection:bg-[#A9C2D9]/40 selection:text-[#2A3B4C]">

        {/* Mobile Slide-out Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            {/* Backdrop overlay */}
            <div
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity duration-300"
              onClick={() => setMobileMenuOpen(false)}
            />

            {/* Drawer panel */}
            <div className="relative flex flex-col w-full max-w-xs h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-5 shadow-2xl transition-transform duration-300 ease-out transform translate-x-0 overflow-y-auto z-50">
              {/* Drawer Header */}
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-indigo-500" />
                  <span className="font-extrabold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                    Optima Panel
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Quick Action Buttons */}
              <div className="space-y-3 mb-6">
                <button
                  onClick={() => {
                    handleAutoSchedule()
                    setMobileMenuOpen(false)
                  }}
                  disabled={loading || (!file && courses.length === 0)}
                  className="w-full py-2.5 px-4 text-xs font-bold rounded-xl bg-[#A9C2D9] dark:bg-indigo-650/80 hover:bg-[#94B0CB] dark:hover:bg-indigo-600 text-[#1E2D3D] dark:text-white flex items-center justify-center gap-2 cursor-pointer shadow-sm transition disabled:opacity-50"
                >
                  <Cpu className="w-4 h-4" />
                  Auto-Schedule (CP-SAT)
                </button>

                <button
                  onClick={() => {
                    handleGenerateMock()
                    setMobileMenuOpen(false)
                  }}
                  disabled={loading}
                  className="w-full py-2.5 px-4 text-xs font-bold rounded-xl text-slate-700 dark:text-slate-350 border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900/40 hover:bg-slate-50 dark:hover:bg-slate-900/80 shadow-sm flex items-center justify-center gap-2 cursor-pointer transition"
                >
                  <Database className="w-4 h-4" />
                  Generate Mock Data
                </button>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-850">
                  <button
                    type="button"
                    onClick={() => setDarkMode(!darkMode)}
                    className="w-full py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-850 transition cursor-pointer text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    {darkMode ? '☀️ Light' : '🌙 Dark'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handleLogout()
                      setMobileMenuOpen(false)
                    }}
                    className="w-full py-2 px-3 rounded-xl border border-rose-200 dark:border-rose-950/30 bg-rose-50/30 dark:bg-rose-950/10 text-rose-600 dark:text-rose-450 hover:bg-rose-100/30 transition active:scale-[0.98] cursor-pointer text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    Log Out
                  </button>
                </div>

                {/* Export Options (Mobile) */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-850 space-y-2">
                  <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">Export Timetable</span>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => { exportToCSV(timetable); setMobileMenuOpen(false); }}
                      disabled={timetable.length === 0}
                      className="py-2 px-1 text-[10px] font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition cursor-pointer text-center disabled:opacity-40"
                    >
                      CSV/Excel
                    </button>
                    <button
                      onClick={() => { exportToPDF(timetable); setMobileMenuOpen(false); }}
                      disabled={timetable.length === 0}
                      className="py-2 px-1 text-[10px] font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition cursor-pointer text-center disabled:opacity-40"
                    >
                      PDF
                    </button>
                    <button
                      onClick={() => { exportToICal(timetable); setMobileMenuOpen(false); }}
                      disabled={timetable.length === 0}
                      className="py-2 px-1 text-[10px] font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition cursor-pointer text-center disabled:opacity-40"
                    >
                      iCal (.ics)
                    </button>
                  </div>
                </div>
              </div>

              {/* Main Drawer Ingestion & Pool Panels */}
              <div className="space-y-6 flex-1">
                {renderIngestionPanel()}
                {!isLargeScreen && renderUnassignedPool()}
              </div>
            </div>
          </div>
        )}

        {/* Glow Effects (Only visible in dark mode!) */}
        <div className="hidden dark:block absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-500/10 blur-[150px] rounded-full pointer-events-none" />
        <div className="hidden dark:block absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-purple-500/10 blur-[180px] rounded-full pointer-events-none" />

        <div className="max-w-[1600px] mx-auto px-6 py-6 relative z-10 flex flex-col min-h-screen">

          {/* Glassmorphic Navbar */}
          <header className="sticky top-4 z-40 backdrop-blur-md bg-white/70 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80 px-6 py-4 rounded-2xl shadow-sm mb-6 transition-colors duration-200">
            <div className="flex justify-between items-center w-full">
              {/* Logo / Title area */}
              <div className="flex items-center gap-3">
                {/* Mobile Hamburger toggle button */}
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  className="lg:hidden p-2 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900/40 text-slate-700 dark:text-slate-300 hover:bg-slate-55 dark:hover:bg-slate-800 transition cursor-pointer"
                  aria-label="Open mobile menu"
                >
                  <Menu className="w-5 h-5" />
                </button>

                <div className="flex flex-col">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="bg-[#A9C2D9]/30 dark:bg-indigo-500/20 text-[#1E2D3D] dark:text-indigo-400 border border-slate-300/40 dark:border-indigo-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider">FastAPI + CP-SAT</span>
                    <span className="text-slate-500 dark:text-slate-400 text-[10px] font-semibold hidden sm:inline">Interactive Panel v1.0</span>
                  </div>
                  <h1 className="text-base sm:text-lg lg:text-2xl font-black tracking-tight text-[#2D3748] dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400">
                    Flexible Timetable Optimization Generator
                  </h1>
                </div>
              </div>

              {/* Desktop action buttons */}
              <div className="hidden lg:flex items-center gap-3">
                {/* Theme Toggle Button */}
                <button
                  type="button"
                  onClick={() => setDarkMode(!darkMode)}
                  className="p-2 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm text-[#333A42] dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer text-xs font-bold flex items-center gap-1.5"
                >
                  {darkMode ? '☀️ Light' : '🌙 Dark'}
                </button>

                {/* Logout Button */}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-3.5 py-2 rounded-xl border border-rose-300 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-450 hover:bg-rose-100/40 transition active:scale-[0.98] cursor-pointer text-xs font-bold flex items-center gap-1.5 shadow-sm"
                >
                  Log Out
                </button>

                <button
                  onClick={handleGenerateMock}
                  disabled={loading}
                  className="px-4 py-2 text-xs font-bold rounded-xl text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-855 bg-white dark:bg-slate-900/40 hover:bg-slate-50 dark:hover:bg-slate-900/80 shadow-sm transition active:scale-[0.98] flex items-center gap-2 cursor-pointer"
                >
                  <Database className="w-3.5 h-3.5 text-slate-500" />
                  Generate Mock Data
                </button>

                <button
                  onClick={handleAutoSchedule}
                  disabled={loading || (!file && courses.length === 0)}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-[#A9C2D9] dark:bg-gradient-to-r dark:from-indigo-600 dark:to-purple-600 hover:bg-[#94B0CB] dark:hover:from-indigo-500 dark:hover:to-purple-500 text-[#1E2D3D] dark:text-white shadow-sm transition disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  <Cpu className="w-3.5 h-3.5" />
                  Auto-Schedule
                </button>

                {/* Export Dropdown Button */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                    disabled={timetable.length === 0}
                    className="px-4 py-2 text-xs font-bold rounded-xl text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900/40 hover:bg-slate-55 dark:hover:bg-slate-900/80 shadow-sm transition active:scale-[0.98] flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                  >
                    <span>📤 Export</span>
                    <span className="text-[8px] text-slate-400 dark:text-slate-500">▼</span>
                  </button>
                  
                  {exportDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-50 p-1.5 space-y-1">
                      <button
                        onClick={() => { exportToCSV(timetable); setExportDropdownOpen(false); }}
                        className="w-full text-left px-3 py-2 text-xs font-semibold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-200 flex items-center gap-2 cursor-pointer"
                      >
                        📊 Export to Excel
                      </button>
                      <button
                        onClick={() => { exportToPDF(timetable); setExportDropdownOpen(false); }}
                        className="w-full text-left px-3 py-2 text-xs font-semibold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-200 flex items-center gap-2 cursor-pointer"
                      >
                        📄 Export to PDF
                      </button>
                      <button
                        onClick={() => { exportToICal(timetable); setExportDropdownOpen(false); }}
                        className="w-full text-left px-3 py-2 text-xs font-semibold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-200 flex items-center gap-2 cursor-pointer"
                      >
                        📅 Export to iCal (.ics)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>

          {/* Clean Metric Blocks */}
          <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl p-4 flex items-center gap-3">
              <div className="p-2 bg-[#E2EAF1] dark:bg-slate-800 rounded-xl"><Layers className="w-5 h-5 text-[#4A607A] dark:text-indigo-400" /></div>
              <div>
                <span className="text-slate-400 dark:text-slate-500 text-[10px] block uppercase font-bold">Unassigned</span>
                <span className="text-lg font-extrabold text-[#333A42] dark:text-slate-200">{unassignedCourses.length} Sessions</span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl p-4 flex items-center gap-3">
              <div className="p-2 bg-[#E1EFE6] dark:bg-slate-800 rounded-xl"><CheckCircle className="w-5 h-5 text-[#4A6B56] dark:text-emerald-400" /></div>
              <div>
                <span className="text-slate-400 dark:text-slate-500 text-[10px] block uppercase font-bold">Scheduled</span>
                <span className="text-lg font-extrabold text-[#333A42] dark:text-slate-200">{timetable.length} Sessions</span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl p-4 flex items-center gap-3">
              <div className={`p-2 rounded-xl ${getWarningsCount() > 0 ? 'bg-[#FBEBEB] dark:bg-rose-950/20' : 'bg-slate-100 dark:bg-slate-800'}`}>
                <ShieldAlert className={`w-5 h-5 ${getWarningsCount() > 0 ? 'text-[#C05656]' : 'text-slate-400 dark:text-slate-500'}`} />
              </div>
              <div>
                <span className="text-slate-400 dark:text-slate-500 text-[10px] block uppercase font-bold">Active Conflicts</span>
                <span className={`text-lg font-extrabold ${getWarningsCount() > 0 ? 'text-[#C05656] dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {getWarningsCount()} Warnings
                </span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl p-4 flex items-center gap-3">
              <div className="p-2 bg-[#F3EBF5] dark:bg-slate-800 rounded-xl"><MapPin className="w-5 h-5 text-[#7D5A80] dark:text-purple-400" /></div>
              <div>
                <span className="text-slate-400 dark:text-slate-500 text-[10px] block uppercase font-bold">Classrooms / Labs</span>
                <span className="text-lg font-extrabold text-[#333A42] dark:text-slate-200">{resources.filter(r => r.ResourceType === 'R').length}R / {resources.filter(r => r.ResourceType !== 'R').length}L</span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl p-4 flex items-center gap-3 col-span-1 sm:col-span-2 md:col-span-1">
              <div className="p-2 bg-[#FAF3E6] dark:bg-slate-800 rounded-xl"><Clock className="w-5 h-5 text-[#8A6D3B] dark:text-amber-400" /></div>
              <div>
                <span className="text-slate-400 dark:text-slate-500 text-[10px] block uppercase font-bold">Solver Runtime</span>
                <span className="text-lg font-extrabold text-[#333A42] dark:text-slate-200">{stats ? `${stats.wall_time_s}s` : 'N/A'}</span>
              </div>
            </div>
          </section>

          {/* Academic Success / Error Status Logs */}
          {(error || successMessage) && (
            <div className={`p-4 rounded-2xl border mb-6 flex items-start gap-3 shadow-sm ${error ? 'bg-[#FBEBEB] dark:bg-red-950/20 border-[#E6C2C2] dark:border-red-500/30 text-[#8C3A3A] dark:text-red-300' : 'bg-[#E1EFE6] dark:bg-emerald-950/20 border-[#C2DEC9] dark:border-emerald-500/25 text-[#2E4A37] dark:text-emerald-300'}`}>
              {error ? <AlertTriangle className="w-5 h-5 text-[#C05656] shrink-0 mt-0.5" /> : <CheckCircle className="w-5 h-5 text-[#4A6B56] shrink-0 mt-0.5" />}
              <div>
                <h4 className="font-bold text-sm uppercase tracking-wide">{error ? 'System Alert' : 'System Success'}</h4>
                <p className="text-xs font-medium mt-1 leading-relaxed whitespace-pre-line">{error || successMessage}</p>
              </div>
            </div>
          )}

          {/* Grid Blueprint Workspace */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start flex-1">

            {/* Sidebar Controls Panel */}
            <aside className="hidden lg:block lg:col-span-1 space-y-6">
              {renderIngestionPanel()}
              {isLargeScreen && renderUnassignedPool()}
            </aside>

            {/* Timetable Ledger Sheet */}
            <main className={`lg:col-span-3 bg-white dark:bg-slate-900/30 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm ${isLargeScreen ? 'overflow-x-auto' : 'overflow-hidden'}`}>

              {loading ? (
                /* Beautiful Skeleton Loading State */
                isLargeScreen ? (
                  <div className="min-w-[800px] space-y-4 animate-pulse">
                    {/* Skeleton Header */}
                    <div className="grid grid-cols-6 gap-3 items-center pb-3 border-b border-slate-200 dark:border-slate-800">
                      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-16"></div>
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-20 mx-auto"></div>
                      ))}
                    </div>
                    {/* Skeleton Rows */}
                    {[...Array(5)].map((_, rIdx) => (
                      <div key={rIdx} className="grid grid-cols-6 gap-3 py-4 border-b border-slate-100 dark:border-slate-800/40 animate-pulse">
                        <div className="space-y-2">
                          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-20"></div>
                          <div className="h-3 bg-slate-100 dark:bg-slate-900 rounded w-12"></div>
                        </div>
                        {[...Array(5)].map((_, cIdx) => (
                          <div key={cIdx} className="h-16 bg-slate-100 dark:bg-slate-900/40 rounded-xl"></div>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4 animate-pulse">
                    {/* Skeleton Tab Selector */}
                    <div className="flex gap-2 pb-3 mb-4 border-b border-slate-200 dark:border-slate-800">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-8 bg-slate-200 dark:bg-slate-800 rounded-xl w-16 shrink-0"></div>
                      ))}
                    </div>
                    {/* Skeleton Header */}
                    <div className="grid grid-cols-12 gap-3 pb-2 border-b border-slate-200 dark:border-slate-800">
                      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded col-span-4 w-16"></div>
                      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded col-span-8 w-24 mx-auto"></div>
                    </div>
                    {/* Skeleton Rows */}
                    {[...Array(4)].map((_, rIdx) => (
                      <div key={rIdx} className="grid grid-cols-12 gap-3 py-3 border-b border-slate-100 dark:border-slate-800/40">
                        <div className="col-span-4 space-y-2">
                          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-20"></div>
                          <div className="h-3 bg-slate-100 dark:bg-slate-900 rounded w-12"></div>
                        </div>
                        <div className="col-span-8 h-20 bg-slate-100 dark:bg-slate-900/40 rounded-xl"></div>
                      </div>
                    ))}
                  </div>
                )
              ) : timetable.length === 0 ? (
                /* Dynamic Empty State Call-to-Action */
                <div className="flex flex-col items-center justify-center py-16 px-6 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/40 dark:bg-slate-950/10">
                  <Calendar className="w-12 h-12 text-[#4A607A] dark:text-indigo-400 mb-4 animate-pulse duration-2000" />
                  <h3 className="font-extrabold text-base text-[#333A42] dark:text-slate-200">
                    {courses.length === 0 ? 'No Academic Dataset Loaded' : 'Timetable Schedule is Empty'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-md leading-relaxed">
                    {courses.length === 0
                      ? 'Ingest your timetable_input.xlsx spreadsheet file or click "Load from Server" in the control panel to load course details.'
                      : 'Drag and drop classes from the Unassigned Pool dock onto any time slot cell, or trigger "Auto-Schedule" in the top bar to run the solver.'}
                  </p>
                  {courses.length > 0 && (
                    <button
                      onClick={handleAutoSchedule}
                      className="mt-5 px-4 py-2.5 text-xs font-bold rounded-xl bg-[#A9C2D9] dark:bg-gradient-to-r dark:from-indigo-650 dark:to-purple-650 text-[#1E2D3D] dark:text-white shadow-sm hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Cpu className="w-3.5 h-3.5" />
                      Auto-Schedule Timetable
                    </button>
                  )}
                </div>
              ) : isLargeScreen ? (
                <div className="min-w-[800px] space-y-4">

                  {/* Header Days Row */}
                  <div className="grid grid-cols-6 gap-3 items-center font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 pb-2 border-b border-slate-200/60 dark:border-slate-800/60">
                    <div className="text-slate-400">Time Slot</div>
                    {DAY_NAMES.map(d => <div key={d} className="text-center font-bold text-[#333A42] dark:text-slate-400">{d}</div>)}
                  </div>

                  {/* Grid Hour Rows */}
                  {TIME_SLOTS.map((slot) => (
                    <div
                      key={slot.tick}
                      className={`grid grid-cols-6 gap-3 min-h-[95px] items-stretch border-b border-slate-100 dark:border-slate-800/40 py-2 ${slot.cat === 'SL0' ? 'dark:bg-indigo-500/[0.01]' : 'dark:bg-purple-500/[0.01]'
                        }`}
                    >

                      {/* Time Slot Stamps */}
                      <div className="flex flex-col justify-center pr-2">
                        <span className="font-bold text-xs text-[#333A42] dark:text-slate-300">{slot.label}</span>
                        <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md mt-1.5 w-max uppercase ${slot.cat === 'SL0'
                            ? 'bg-[#FAF3E6] dark:bg-amber-500/10 text-[#8A6D3B] dark:text-amber-400 border border-[#ECDCC4] dark:border-amber-500/20'
                            : 'bg-[#E2EAF1] dark:bg-indigo-500/10 text-[#4A607A] dark:text-indigo-400 border border-[#CBDCEB] dark:border-indigo-500/20'
                          }`}>
                          {slot.cat === 'SL0' ? 'Morning' : 'Afternoon'}
                        </span>
                      </div>

                      {/* Day Ingestion Slots */}
                      {DAY_NAMES.map((day, dIdx) => {
                        const droppableId = `cell_${dIdx}_${slot.tick}`
                        const cellSessions = timetable.filter(s => s.DayIndex === dIdx && s.StartTick === slot.tick)

                        const isValid = draggedSession ? isValidCell(draggedSession, dIdx, slot.tick) : true
                        const isDragging = !!draggedSession

                        return (
                          <Droppable key={droppableId} droppableId={droppableId}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                                className={`rounded-xl p-2 transition-all flex flex-col gap-2 min-h-[85px] justify-start border ${snapshot.isDraggingOver
                                    ? 'bg-[#E2EAF1]/60 dark:bg-indigo-500/10 border-[#A9C2D9] dark:border-indigo-400 shadow-sm'
                                    : isDragging
                                      ? isValid
                                        ? 'border-[#C2DEC9] dark:border-emerald-500/30 bg-[#E1EFE6]/20 dark:bg-emerald-500/[0.02]'
                                        : 'border-slate-100 dark:border-slate-800/20 bg-slate-50/40 dark:bg-slate-950/40 opacity-20 pointer-events-none'
                                      : 'border-slate-200/60 dark:border-slate-800/60 bg-[#F8FAFC] dark:bg-slate-950/20 hover:bg-slate-900/10'
                                  }`}
                              >
                                {cellSessions.map((s, idx) => (
                                  <SessionCard
                                    key={s.id}
                                    session={s}
                                    index={idx}
                                    conflicts={conflicts[s.id]}
                                    gridMode={true}
                                  />
                                ))}
                                {provided.placeholder}
                              </div>
                            )}
                          </Droppable>
                        )
                      })}

                    </div>
                  ))}

                </div>
              ) : (
                /* Mobile Day Selector Tabs & 2-Column Grid */
                <div className="space-y-4">
                  {/* Mobile Day Selector Tabs */}
                  <div className="flex overflow-x-auto gap-2 pb-3 mb-4 border-b border-slate-200/60 dark:border-slate-800/60 scrollbar-none">
                    {DAY_NAMES.map((d, dIdx) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setSelectedDayIndex(dIdx)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm border shrink-0 cursor-pointer ${
                          selectedDayIndex === dIdx
                            ? 'bg-[#A9C2D9] dark:bg-indigo-600 text-[#1E2D3D] dark:text-white border-[#A9C2D9] dark:border-indigo-500'
                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-405 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>

                  {/* Mobile Header Row */}
                  <div className="grid grid-cols-12 gap-3 items-center font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 pb-2 border-b border-slate-200/60 dark:border-slate-800/60">
                    <div className="col-span-4">Time Slot</div>
                    <div className="col-span-8 text-center font-bold text-[#333A42] dark:text-slate-400">
                      {DAY_NAMES[selectedDayIndex]}
                    </div>
                  </div>

                  {/* Mobile Grid Hour Rows */}
                  {TIME_SLOTS.map((slot) => {
                    const droppableId = `cell_${selectedDayIndex}_${slot.tick}`
                    const cellSessions = timetable.filter(s => s.DayIndex === selectedDayIndex && s.StartTick === slot.tick)
                    const isValid = draggedSession ? isValidCell(draggedSession, selectedDayIndex, slot.tick) : true
                    const isDragging = !!draggedSession

                    return (
                      <div
                        key={slot.tick}
                        className={`grid grid-cols-12 gap-3 items-stretch border-b border-slate-100 dark:border-slate-800/40 py-2 ${
                          slot.cat === 'SL0' ? 'dark:bg-indigo-500/[0.01]' : 'dark:bg-purple-500/[0.01]'
                        }`}
                      >
                        {/* Left Column: Time Slot Stamps */}
                        <div className="col-span-4 flex flex-col justify-center pr-2">
                          <span className="font-bold text-xs text-[#333A42] dark:text-slate-300">{slot.label}</span>
                          <span className={`text-[8px] font-extrabold px-1 py-0.5 rounded-md mt-1 w-max uppercase ${
                            slot.cat === 'SL0'
                              ? 'bg-[#FAF3E6] dark:bg-amber-500/10 text-[#8A6D3B] dark:text-amber-400 border border-[#ECDCC4] dark:border-amber-500/20'
                              : 'bg-[#E2EAF1] dark:bg-indigo-500/10 text-[#4A607A] dark:text-indigo-400 border border-[#CBDCEB] dark:border-indigo-500/20'
                          }`}>
                            {slot.cat === 'SL0' ? 'Morning' : 'Afternoon'}
                          </span>
                        </div>

                        {/* Right Column: Droppable Day Cell */}
                        <div className="col-span-8">
                          <Droppable droppableId={droppableId}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                                className={`rounded-xl p-2 transition-all flex flex-col gap-2 min-h-[85px] justify-start border ${
                                  snapshot.isDraggingOver
                                    ? 'bg-[#E2EAF1]/60 dark:bg-indigo-500/10 border-[#A9C2D9] dark:border-indigo-400 shadow-sm'
                                    : isDragging
                                      ? isValid
                                        ? 'border-[#C2DEC9] dark:border-emerald-500/30 bg-[#E1EFE6]/20 dark:bg-emerald-500/[0.02]'
                                        : 'border-slate-100 dark:border-slate-800/20 bg-slate-50/40 dark:bg-slate-950/40 opacity-20 pointer-events-none'
                                      : 'border-slate-200/60 dark:border-slate-800/60 bg-[#F8FAFC] dark:bg-slate-950/20 hover:bg-slate-900/10'
                                }`}
                              >
                                {cellSessions.map((s, idx) => (
                                  <SessionCard
                                    key={s.id}
                                    session={s}
                                    index={idx}
                                    conflicts={conflicts[s.id]}
                                    gridMode={true}
                                  />
                                ))}
                                {provided.placeholder}
                              </div>
                            )}
                          </Droppable>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

            </main>

          </div>

        </div>

        {/* Custom Toast Notifications */}
        <div className="fixed bottom-5 right-5 z-[999] flex flex-col gap-3 max-w-sm pointer-events-none">
          {toasts.map(t => (
            <div
              key={t.id}
              className={`p-4 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-xl border border-slate-200/80 dark:border-slate-800 text-xs font-bold pointer-events-auto flex items-center gap-2.5 min-w-[280px] transition-all duration-300 ${
                t.type === 'error'
                  ? 'border-l-4 border-l-rose-500 text-rose-800 dark:text-rose-300'
                  : t.type === 'info'
                    ? 'border-l-4 border-l-indigo-500 text-indigo-800 dark:text-indigo-300'
                    : 'border-l-4 border-l-emerald-500 text-emerald-800 dark:text-emerald-300'
              }`}
            >
              <span className="text-sm shrink-0">
                {t.type === 'error' ? '⚠️' : t.type === 'info' ? 'ℹ️' : '✅'}
              </span>
              <span className="flex-1">{t.message}</span>
              <button
                type="button"
                onClick={() => setToasts(prev => prev.filter(toast => toast.id !== t.id))}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer text-[10px] pl-2 select-none font-bold"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

      </div>
    </DragDropContext>
  )

  // Soft Pastel Component Cards
  function SessionCard({ session, index, conflicts = [], gridMode = false }) {
    const typeofCore = session.CourseType === 'C'
    const typeofLab = session.CourseType === 'L'
    const typeofElec = session.CourseType === 'E'
    const warnActive = conflicts.length > 0

    return (
      <Draggable draggableId={session.id} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            className={`p-3 rounded-xl border text-xs shadow-sm transition-all active:scale-[0.99] ${snapshot.isDragging
                ? 'scale-105 border-[#A9C2D9] dark:border-indigo-400 bg-white dark:bg-indigo-950 ring-4 ring-[#A9C2D9]/30 dark:ring-indigo-500/40 shadow-md'
                : warnActive
                  ? 'border-[#E6C2C2] dark:border-rose-500/30 bg-[#FBEBEB] dark:bg-rose-950/30 text-[#8C3A3A] dark:text-rose-300'
                  : typeofCore
                    ? 'border-[#CBDCEB] dark:border-blue-500/30 bg-[#E2EAF1] dark:bg-blue-950/20 text-[#2A3B4C] dark:text-slate-200 hover:bg-[#D3E0EC] dark:hover:border-blue-500/60'
                    : typeofLab
                      ? 'border-[#F1D4D0] dark:border-pink-500/30 bg-[#F7E7E5] dark:bg-pink-950/20 text-[#6E423C] dark:text-slate-200 hover:bg-[#ECD8D5] dark:hover:border-pink-500/60'
                      : typeofElec
                        ? 'border-[#E4D7E5] dark:border-purple-500/30 bg-[#F3EBF5] dark:bg-purple-950/20 text-[#543C56] dark:text-slate-200 hover:bg-[#EAE0EC] dark:hover:border-purple-500/60'
                        : 'border-[#ECDCC4] dark:border-amber-500/30 bg-[#FAF3E6] dark:bg-amber-950/20 text-[#5A4B31] dark:text-slate-200 hover:bg-[#EFE4D0] dark:hover:border-amber-500/60'
              }`}
          >
            {/* Tag Badges */}
            <div className="flex items-center justify-between gap-1.5 mb-1.5 flex-wrap">
              <span className={`font-bold font-mono tracking-wide px-1.5 py-0.5 rounded text-[10px] ${warnActive ? 'bg-[#F2D6D6] dark:bg-rose-500/10 text-[#8C3A3A] dark:text-rose-400 border border-[#E6C2C2] dark:border-rose-500/20' :
                  typeofCore ? 'bg-[#D3E0EC] dark:bg-blue-500/10 text-[#2A3B4C] dark:text-blue-400 border border-[#CBDCEB] dark:border-blue-500/20' :
                    typeofLab ? 'bg-[#ECD8D5] dark:bg-pink-500/10 text-[#6E423C] dark:text-pink-400 border border-[#F1D4D0] dark:border-pink-500/20' :
                      typeofElec ? 'bg-[#EAE0EC] dark:bg-purple-500/10 text-[#543C56] dark:text-purple-400 border border-[#E4D7E5] dark:border-purple-500/20' :
                        'bg-[#EFE4D0] dark:bg-amber-500/10 text-[#5A4B31] dark:text-amber-400 border border-[#ECDCC4] dark:border-amber-500/20'
                }`}>
                {session.CourseCode}
              </span>
              <span className="text-[9px] text-slate-400 dark:text-slate-500 font-extrabold uppercase tracking-wider">
                {typeofLab ? 'Lab' : session.CourseType === 'T' ? 'Tut' : typeofElec ? 'Elec' : 'Core'}
              </span>
            </div>

            {/* Title Display */}
            <div className="font-bold text-slate-800 dark:text-slate-200 mb-2 truncate max-w-full leading-tight">
              {session.CourseName}
            </div>

            {/* Structural Parameters info line */}
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 border-t border-slate-400/20 dark:border-slate-800/60 pt-2 mt-2">
              <span className="bg-white/60 dark:bg-slate-800/60 px-1.5 py-0.5 rounded-md text-slate-700 dark:text-slate-300 font-semibold border border-slate-300/30 dark:border-transparent">
                {session.Duration} hr
              </span>

              {session.ElectiveGroup && (
                <span className="bg-[#EAE0EC] dark:bg-purple-500/10 text-[#543C56] dark:text-purple-400 px-1.5 py-0.5 rounded border border-[#E4D7E5] dark:border-purple-500/20 font-bold">
                  Group {session.ElectiveGroup}
                </span>
              )}

              {(session.InstanceIndex > 0 || session.LabSessionsIndex) && (
                <span className="bg-white/80 dark:bg-slate-800 px-1 py-0.5 rounded-md text-[8px] border border-slate-300/20 dark:border-transparent font-bold uppercase">
                  {session.LabSessionsIndex ? `${session.LabSessionsIndex} I${session.InstanceIndex}` : `Sess ${session.InstanceIndex + 1}`}
                </span>
              )}
            </div>

            {/* Space Dropdowns allocation */}
            {gridMode && (
              <div className="mt-2.5 pt-2 border-t border-slate-400/20 dark:border-slate-800/40 flex items-center justify-between gap-2">
                <span className="text-[9px] text-slate-400 dark:text-slate-500 uppercase font-extrabold flex items-center gap-0.5">
                  <MapPin className="w-2.5 h-2.5" />
                  Room
                </span>
                <select
                  value={session.RoomID || 'Unassigned'}
                  onChange={(e) => handleRoomChange(session.id, e.target.value)}
                  className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:outline-none focus:border-[#A9C2D9] dark:focus:border-indigo-500 shrink-0 cursor-pointer shadow-sm min-h-[36px]"
                >
                  <option value="Unassigned">Select...</option>
                  {getRoomPool(session).map(r => (
                    <option key={r.ResourceID} value={r.ResourceID}>{r.ResourceID}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Constraint warning boxes */}
            {warnActive && (
              <div className="mt-2.5 p-1.5 bg-[#FDF2F2] dark:bg-rose-950/40 border border-[#E6C2C2] dark:border-rose-500/25 rounded-lg text-[10px] text-[#8C3A3A] dark:text-rose-300 flex flex-col gap-1 font-medium leading-normal">
                {conflicts.map((warn, wIdx) => (
                  <div key={wIdx} className="flex items-start gap-1">
                    <span className="text-[#C05656] select-none shrink-0">•</span>
                    <span>{warn}</span>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}
      </Draggable>
    )
  }
}

// Beautiful light/dark mode compatible Login/Signup toggle form
function AuthForm({ token, setToken, darkMode, setDarkMode, BACKEND_URL, showToast }) {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!email || !password) {
      setError('Please fill in all fields.')
      return
    }

    if (!isLogin && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      if (isLogin) {
        // Login API Call
        const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email, password })
        })
        const result = await res.json()
        if (res.ok) {
          localStorage.setItem('token', result.access_token)
          showToast('Welcome back! Successfully logged in.', 'success')
          setToken(result.access_token)
        } else {
          const errMsg = result.detail || 'Incorrect email or password.'
          setError(errMsg)
          showToast(errMsg, 'error')
        }
      } else {
        // Signup API Call
        const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email, password })
        })
        const result = await res.json()
        if (res.ok) {
          setSuccess('Account created successfully! Logging you in...')
          showToast('Account created successfully!', 'success')
          // Automatically log the user in after registration
          setTimeout(async () => {
            try {
              const loginRes = await fetch(`${BACKEND_URL}/api/auth/login`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
              })
              const loginResult = await loginRes.json()
              if (loginRes.ok) {
                localStorage.setItem('token', loginResult.access_token)
                showToast('Welcome to your new workspace!', 'success')
                setToken(loginResult.access_token)
              } else {
                setIsLogin(true)
                setSuccess(null)
                const errMsg = 'Registration succeeded, but auto-login failed. Please sign in.'
                setError(errMsg)
                showToast(errMsg, 'error')
              }
            } catch (err) {
              setIsLogin(true)
              setSuccess(null)
              const errMsg = 'Registration succeeded. Please sign in.'
              setError(errMsg)
              showToast(errMsg, 'error')
            }
          }, 1000)
        } else {
          const errMsg = result.detail || 'Registration failed.'
          setError(errMsg)
          showToast(errMsg, 'error')
        }
      }
    } catch (err) {
      const errMsg = 'Connection error. Is the backend running?'
      setError(errMsg)
      showToast(errMsg, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F0F4F8] text-[#333A42] dark:bg-slate-950 dark:text-slate-100 font-sans relative overflow-x-hidden transition-colors duration-200 p-4">
      {/* Background Glows */}
      <div className="hidden dark:block absolute top-[10%] left-[20%] w-[400px] h-[400px] bg-indigo-500/10 blur-[130px] rounded-full pointer-events-none" />
      <div className="hidden dark:block absolute bottom-[10%] right-[20%] w-[400px] h-[400px] bg-purple-500/10 blur-[130px] rounded-full pointer-events-none" />

      {/* Main card */}
      <div className="w-full max-w-sm relative z-10">
        <div className="bg-white/85 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/80 backdrop-blur-xl rounded-3xl p-6 sm:p-8 shadow-2xl transition-all duration-300">
          
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <span className="bg-[#A9C2D9] dark:bg-indigo-500 text-[#1E2D3D] dark:text-slate-100 text-[10px] font-bold px-3 py-1 rounded-md uppercase tracking-wider">FastAPI + React</span>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition cursor-pointer"
            >
              {darkMode ? '☀️ Light' : '🌙 Dark'}
            </button>
          </div>

          <h2 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 text-center tracking-tight mb-2">
            {isLogin ? 'Sign In to Your Workspace' : 'Create Academic Account'}
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center mb-6">
            {isLogin ? 'Enter your credentials to manage timetable schedules' : 'Sign up to configure and optimize class allocations'}
          </p>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-500/20 rounded-2xl text-xs text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-2">
              <span className="text-sm">⚠️</span>
              {error}
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-2">
              <span className="text-sm">✅</span>
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="professor@university.edu"
                className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-650 focus:outline-none focus:border-[#A9C2D9] dark:focus:border-indigo-500 transition-colors shadow-sm"
              />
            </div>

            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-650 focus:outline-none focus:border-[#A9C2D9] dark:focus:border-indigo-500 transition-colors shadow-sm"
              />
            </div>

            {!isLogin && (
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">Confirm Password</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-650 focus:outline-none focus:border-[#A9C2D9] dark:focus:border-indigo-500 transition-colors shadow-sm"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#A9C2D9] dark:bg-gradient-to-r dark:from-indigo-600 dark:to-purple-600 hover:bg-[#94B0CB] dark:hover:from-indigo-500 dark:hover:to-purple-500 text-[#1E2D3D] dark:text-white text-xs font-bold rounded-2xl shadow-md transition active:scale-[0.98] cursor-pointer disabled:opacity-50 mt-2 flex items-center justify-center gap-2"
            >
              {loading ? 'Processing...' : isLogin ? 'Sign In' : 'Sign Up'}
            </button>
          </form>

          {/* Toggle Tab Footer */}
          <div className="mt-6 pt-5 border-t border-slate-200/50 dark:border-slate-800/50 text-center">
            <button
              onClick={() => {
                setIsLogin(!isLogin)
                setError(null)
                setSuccess(null)
              }}
              className="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer py-2.5 px-4 w-full block text-center"
            >
              {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}

export default App
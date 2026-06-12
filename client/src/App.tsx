import { Routes, Route, NavLink } from 'react-router-dom';
import { useJobEvents } from './hooks/useJobEvents';
import { Dashboard } from './pages/Dashboard';
import { Jobs } from './pages/Jobs';
import { CreateJob } from './pages/CreateJob';
import { Dlq } from './pages/Dlq';
import { Benchmark } from './pages/Benchmark';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded text-sm font-medium transition-colors ${
    isActive
      ? 'bg-indigo-700 text-white'
      : 'text-indigo-100 hover:bg-indigo-600 hover:text-white'
  }`;

export default function App() {
  useJobEvents();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-indigo-800 shadow">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center gap-6">
            <span className="text-white font-semibold tracking-tight">Job Scheduler</span>
            <div className="flex gap-1">
              <NavLink to="/" end className={navClass}>Dashboard</NavLink>
              <NavLink to="/jobs" className={navClass}>Jobs</NavLink>
              <NavLink to="/jobs/new" className={navClass}>Create Job</NavLink>
              <NavLink to="/dlq" className={navClass}>DLQ</NavLink>
              <NavLink to="/benchmark" className={navClass}>Benchmark</NavLink>
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/jobs/new" element={<CreateJob />} />
          <Route path="/dlq" element={<Dlq />} />
          <Route path="/benchmark" element={<Benchmark />} />
        </Routes>
      </main>
    </div>
  );
}

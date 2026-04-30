import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useTheme } from '../lib/theme'
import { Flame, Loader2, Moon, Sun } from 'lucide-react'

export default function Signup() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const { signup, isLoading, error } = useAuth()
  const [localError, setLocalError] = useState<string | null>(null)
  const { isDark, toggleTheme } = useTheme()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    if (!name || !email || !password) {
      setLocalError('ALL FIELDS REQUIRED')
      return
    }
    if (password !== confirm) {
      setLocalError('PASSWORDS DO NOT MATCH')
      return
    }
    if (password.length < 6) {
      setLocalError('PASSWORD MUST BE 6+ CHARACTERS')
      return
    }
    try {
      await signup(name, email, password)
    } catch (err: any) {
      setLocalError(err.message || 'REGISTRATION FAILED')
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-black dark:text-gray-100 font-mono flex items-center justify-center p-4 transition-colors">
      <button
        onClick={toggleTheme}
        className="absolute top-4 right-4 p-2 border-2 border-black dark:border-gray-700 hover:bg-black hover:text-white dark:hover:bg-gray-100 dark:hover:text-gray-950 transition-colors"
        aria-label="Toggle theme"
      >
        {isDark ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <div className="w-full max-w-md border-4 border-black dark:border-gray-700 p-8">
        <div className="flex items-center gap-3 mb-8">
          <Flame size={28} className="text-red-600" />
          <h1 className="text-2xl font-black tracking-tighter">STRIDE</h1>
        </div>
        <h2 className="text-lg font-bold mb-6">AUTHENTICATION // REGISTER</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold mb-1 text-neutral-500 dark:text-gray-400">NAME</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-900 text-black dark:text-gray-100 font-bold text-sm focus:outline-none focus:bg-neutral-50 dark:focus:bg-gray-800 placeholder:text-neutral-400 dark:placeholder:text-gray-600"
              placeholder="John Doe"
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1 text-neutral-500 dark:text-gray-400">EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-900 text-black dark:text-gray-100 font-bold text-sm focus:outline-none focus:bg-neutral-50 dark:focus:bg-gray-800 placeholder:text-neutral-400 dark:placeholder:text-gray-600"
              placeholder="user@example.com"
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1 text-neutral-500 dark:text-gray-400">PASSWORD</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-900 text-black dark:text-gray-100 font-bold text-sm focus:outline-none focus:bg-neutral-50 dark:focus:bg-gray-800 placeholder:text-neutral-400 dark:placeholder:text-gray-600"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1 text-neutral-500 dark:text-gray-400">CONFIRM PASSWORD</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full px-4 py-3 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-900 text-black dark:text-gray-100 font-bold text-sm focus:outline-none focus:bg-neutral-50 dark:focus:bg-gray-800 placeholder:text-neutral-400 dark:placeholder:text-gray-600"
              placeholder="••••••••"
            />
          </div>
          {(localError || error) && (
            <div className="p-3 border-2 border-red-600 bg-red-50 dark:bg-red-950 text-xs font-bold text-red-700 dark:text-red-400">
              {localError || error}
            </div>
          )}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full px-4 py-3 bg-black dark:bg-gray-100 text-white dark:text-gray-950 font-bold text-sm border-2 border-black dark:border-gray-700 hover:bg-red-600 dark:hover:bg-red-600 dark:hover:text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'CREATE ACCOUNT →'}
          </button>
        </form>
        <div className="mt-6 text-xs font-bold text-neutral-500 dark:text-gray-400">
          ALREADY REGISTERED?{' '}
          <Link to="/login" className="text-black dark:text-gray-100 underline hover:text-red-600">
            LOGIN HERE
          </Link>
        </div>
      </div>
    </div>
  )
}

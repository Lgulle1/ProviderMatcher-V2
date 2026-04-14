import { useState } from 'react'
import { ArrowRight, Check, CheckCircle2, Upload } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import type { Location } from '../../types/database'
import StepIndicator from '../../components/ui/StepIndicator'

type Step = 1 | 2 | 3 | 4
type ImportChoice = 'upload' | 'skip'

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>(1)
  const [addedLocations, setAddedLocations] = useState<Location[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [locationForm, setLocationForm] = useState({
    name: '',
    address: '',
    phone: '',
  })
  const [locationError, setLocationError] = useState('')
  const [completeError, setCompleteError] = useState('')
  const [importChoice, setImportChoice] = useState<ImportChoice>('upload')

  const navigate = useNavigate()
  const org = useAuthStore((s) => s.org)
  const setOrg = useAuthStore((s) => s.setOrg)

  async function handleAddLocation() {
    setLocationError('')
    const name = locationForm.name.trim()

    if (!name) {
      setLocationError('Location name is required.')
      return
    }

    if (!org?.id) {
      setLocationError('Organization not found. Please sign in again.')
      return
    }

    const { data, error } = await supabase
      .from('locations')
      .insert({
        org_id: org.id,
        name,
        address: locationForm.address.trim() || null,
        phone: locationForm.phone.trim() || null,
      })
      .select()
      .single()

    if (error || !data) {
      setLocationError('Failed to add location. Please try again.')
      return
    }

    setAddedLocations((prev) => [...prev, data as Location])
    setLocationForm({ name: '', address: '', phone: '' })
  }

  async function handleCompleteOnboarding() {
    setCompleteError('')
    if (!org?.id) {
      setCompleteError('Organization not found. Please sign in again.')
      return
    }

    setIsLoading(true)
    const { error } = await supabase
      .from('organizations')
      .update({ onboarding_completed: true })
      .eq('id', org.id)

    if (error) {
      setCompleteError('Failed to complete onboarding. Please try again.')
      setIsLoading(false)
      return
    }

    setOrg({ ...org, onboarding_completed: true })
    navigate('/dashboard')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-8 shadow-lg">
        <StepIndicator currentStep={step} totalSteps={4} />

        {step === 1 ? (
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Welcome to ProviderMatcher</h1>
            <p className="mt-3 text-slate-600">
              Let&apos;s get your provider directory set up. You&apos;ll add your office locations,
              import your providers, and be ready to build your first widget.
            </p>
            <button
              type="button"
              className="mt-6 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
              onClick={() => setStep(2)}
            >
              Get Started →
            </button>
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Where do your providers practice?</h1>
            <p className="mt-2 text-slate-600">
              Add your clinic or office locations. You can always add more later.
            </p>

            <div className="mt-6 space-y-3">
              <input
                type="text"
                placeholder="Name"
                value={locationForm.name}
                onChange={(e) =>
                  setLocationForm((prev) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                type="text"
                placeholder="Address (optional)"
                value={locationForm.address}
                onChange={(e) =>
                  setLocationForm((prev) => ({
                    ...prev,
                    address: e.target.value,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                type="text"
                placeholder="Phone (optional)"
                value={locationForm.phone}
                onChange={(e) =>
                  setLocationForm((prev) => ({
                    ...prev,
                    phone: e.target.value,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={handleAddLocation}
                className="w-full rounded-lg border border-indigo-600 py-2.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
              >
                Add Location
              </button>
            </div>

            {locationError ? <p className="mt-3 text-sm text-red-600">{locationError}</p> : null}

            {addedLocations.length > 0 ? (
              <div className="mt-4 space-y-2">
                {addedLocations.map((location) => (
                  <div
                    key={location.id}
                    className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700"
                  >
                    <Check className="h-4 w-4" />
                    <span>{location.name}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <button
              type="button"
              className="mt-4 text-sm text-slate-500 underline"
              onClick={() => setStep(3)}
            >
              Skip for now
            </button>

            <button
              type="button"
              disabled={addedLocations.length === 0}
              onClick={() => setStep(3)}
              className="mt-4 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Continue →
            </button>
          </div>
        ) : null}

        {step === 3 ? (
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Add your providers</h1>
            <p className="mt-2 text-slate-600">
              Upload your provider data from a spreadsheet, or skip and add manually from the
              dashboard.
            </p>

            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={() => setImportChoice('upload')}
                className={[
                  'w-full cursor-pointer rounded-xl border p-4 text-left',
                  importChoice === 'upload'
                    ? 'border-indigo-300 bg-indigo-50'
                    : 'border-slate-200 bg-white',
                ].join(' ')}
              >
                <div className="flex items-center gap-3">
                  <Upload className="h-5 w-5 text-indigo-600" />
                  <div>
                    <p className="font-medium text-slate-900">Upload Spreadsheet</p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setImportChoice('skip')}
                className={[
                  'w-full cursor-pointer rounded-xl border p-4 text-left',
                  importChoice === 'skip'
                    ? 'border-indigo-300 bg-indigo-50'
                    : 'border-slate-200 bg-white',
                ].join(' ')}
              >
                <div className="flex items-center gap-3">
                  <ArrowRight className="h-5 w-5 text-slate-600" />
                  <div>
                    <p className="font-medium text-slate-900">Skip for now</p>
                  </div>
                </div>
              </button>
            </div>

            <p className="mt-4 text-sm text-slate-500">
              The full import wizard is available from the dashboard anytime.
            </p>

            <button
              type="button"
              onClick={() => setStep(4)}
              className="mt-6 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Continue →
            </button>
          </div>
        ) : null}

        {step === 4 ? (
          <div>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100">
              <CheckCircle2 className="text-indigo-600" size={32} />
            </div>
            <h1 className="mt-4 text-center text-2xl font-bold text-slate-900">You&apos;re all set!</h1>
            <p className="mt-3 text-center text-slate-600">
              Your directory is ready. Head to the dashboard to explore or create your first
              widget.
            </p>
            {completeError ? <p className="mt-3 text-sm text-red-600">{completeError}</p> : null}
            <button
              type="button"
              onClick={handleCompleteOnboarding}
              disabled={isLoading}
              className="mt-6 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? 'Finishing setup...' : 'Go to Dashboard →'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

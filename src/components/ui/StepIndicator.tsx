import { Check } from 'lucide-react'

interface StepIndicatorProps {
  currentStep: number
  totalSteps: number
}

export default function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps) {
  const steps = Array.from({ length: totalSteps }, (_, i) => i + 1)

  return (
    <div className="mx-auto mb-8 flex w-full max-w-sm items-center">
      {steps.map((step, index) => {
        const isCompleted = step < currentStep
        const isActive = step === currentStep

        return (
          <div key={step} className="flex flex-1 items-center">
            <div
              className={[
                'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium',
                isCompleted || isActive ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-400',
              ].join(' ')}
            >
              {isCompleted ? <Check size={14} /> : step}
            </div>
            {index < steps.length - 1 ? (
              <div
                className={[
                  'h-0.5 flex-1',
                  step < currentStep ? 'bg-indigo-600' : 'bg-slate-200',
                ].join(' ')}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

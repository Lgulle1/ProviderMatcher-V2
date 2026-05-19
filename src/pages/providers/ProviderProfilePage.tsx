import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Pencil, Stethoscope, Trash2, Upload, X } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import EmptyState from '../../components/ui/EmptyState'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { useToast } from '../../components/ui/Toast'
import {
  archiveProvider,
  getProvider,
  updateProvider,
  uploadProviderImage,
} from '../../lib/api/providers'
import {
  getProviderLocations,
  upsertProviderLocation,
} from '../../lib/api/providerLocations'
import {
  archiveOffering,
  createOffering,
  getOfferingsByProvider,
  updateOffering,
} from '../../lib/api/offerings'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import type {
  CaseType,
  Category,
  Constraint,
  Location as OrgLocation,
} from '../../types/database'

interface ProviderFormValues {
  name: string
  subtitle: string
  npi: string
  email: string
  bio_link: string
}

function sameIds(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((id, idx) => id === sortedB[idx])
}

export default function ProviderProfilePage() {
  const { id } = useParams<{ id: string }>()
  const orgId = useAuthStore((s) => s.org?.id ?? '')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [originalCategoryIds, setOriginalCategoryIds] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [bookingLinks, setBookingLinks] = useState<Record<string, string>>({})
  const [modal, setModal] = useState<{
    type: 'add-offering' | 'edit-offering' | 'delete-offering' | null
    payload?: any
  }>({ type: null })
  const [offeringCaseTypeId, setOfferingCaseTypeId] = useState('')
  const [offeringDraftLocationIds, setOfferingDraftLocationIds] = useState<string[]>([])
  const [offeringConstraints, setOfferingConstraints] = useState<Record<string, any>>({})
  const [offeringError, setOfferingError] = useState('')
  const [offeringSaving, setOfferingSaving] = useState(false)

  const { register, reset, handleSubmit, formState } = useForm<ProviderFormValues>({
    defaultValues: {
      name: '',
      subtitle: '',
      npi: '',
      email: '',
      bio_link: '',
    },
  })

  const { data: provider, isLoading: providerLoading } = useQuery({
    queryKey: ['provider', id],
    queryFn: () => getProvider(id as string),
    enabled: Boolean(id),
  })

  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ['categories', orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from('categories')
        .select('*')
        .eq('org_id', orgId)
        .eq('is_archived', false)
        .order('name', { ascending: true })
      return (data ?? []) as Category[]
    },
    enabled: Boolean(orgId),
  })

  const { data: providerLocations = [], isLoading: providerLocationsLoading } = useQuery({
    queryKey: ['provider-locations', id],
    queryFn: () => getProviderLocations(id as string),
    enabled: Boolean(id),
  })

  const { data: orgLocations = [], isLoading: orgLocationsLoading } = useQuery({
    queryKey: ['locations', orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from('locations')
        .select('*')
        .eq('org_id', orgId)
        .eq('is_archived', false)
        .order('name', { ascending: true })
      return (data ?? []) as OrgLocation[]
    },
    enabled: Boolean(orgId),
  })

  const { data: offerings = [], isLoading: offeringsLoading } = useQuery({
    queryKey: ['provider-offerings', id],
    queryFn: () => getOfferingsByProvider(id as string),
    enabled: Boolean(id),
  })

  const { data: orgCaseTypes = [] } = useQuery({
    queryKey: ['case-types', orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from('case_types')
        .select('*')
        .eq('org_id', orgId)
        .eq('is_archived', false)
      return (data ?? []) as CaseType[]
    },
    enabled: Boolean(orgId),
  })

  const { data: orgConstraints = [] } = useQuery({
    queryKey: ['constraints', orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from('constraints')
        .select('*')
        .eq('org_id', orgId)
        .eq('is_archived', false)
      return (data ?? []) as Constraint[]
    },
    enabled: Boolean(orgId),
  })

  useEffect(() => {
    if (!provider) return
    reset({
      name: provider.name ?? '',
      subtitle: provider.subtitle ?? '',
      npi: provider.npi ?? '',
      email: provider.email ?? '',
      bio_link: provider.bio_link ?? '',
    })
    setCategoryIds(provider.category_ids ?? [])
    setOriginalCategoryIds(provider.category_ids ?? [])
  }, [provider, reset])

  useEffect(() => {
    const next: Record<string, string> = {}
    providerLocations.forEach((entry) => {
      next[entry.location_id] = entry.booking_link ?? ''
    })
    setBookingLinks(next)
  }, [providerLocations])

  useEffect(() => {
    if (modal.type !== null) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModal({ type: null })
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [modal.type])

  useEffect(() => {
    if (modal.type === 'edit-offering' && modal.payload) {
      setOfferingCaseTypeId(modal.payload.case_type_id ?? '')
      setOfferingDraftLocationIds(modal.payload.location_ids ?? [])
      setOfferingConstraints(modal.payload.constraints ?? {})
    }
    if (modal.type === 'add-offering') {
      setOfferingCaseTypeId('')
      setOfferingDraftLocationIds([])
      setOfferingConstraints({})
      setOfferingError('')
    }
  }, [modal.type, modal.payload])

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  )

  const unassignedCategories = useMemo(
    () => categories.filter((category) => !categoryIds.includes(category.id)),
    [categories, categoryIds]
  )

  const bookingLinkBaselineByLocationId = useMemo(() => {
    const map = new Map<string, string>()
    providerLocations.forEach((entry) => {
      map.set(entry.location_id, (entry.booking_link ?? '').trim())
    })
    return map
  }, [providerLocations])

  const caseTypeNameById = useMemo(() => {
    const map = new Map<string, string>()
    orgCaseTypes.forEach((caseType) => map.set(caseType.id, caseType.name))
    return map
  }, [orgCaseTypes])
  const locationNameById = useMemo(() => {
    const map = new Map<string, string>()
    orgLocations.forEach((location) => map.set(location.id, location.name))
    return map
  }, [orgLocations])

  const offeringLocationIds = useMemo(() => {
    const set = new Set<string>()
    offerings.forEach((offering) => {
      ;(offering.location_ids ?? []).forEach((locId) => {
        if (locId) {
          set.add(locId)
        }
      })
    })
    const ids = Array.from(set)
    ids.sort((a, b) => (locationNameById.get(a) ?? '').localeCompare(locationNameById.get(b) ?? ''))
    return ids
  }, [offerings, locationNameById])

  const hasBookingLinkChanges = useMemo(() => {
    return offeringLocationIds.some((locationId) => {
      const current = (bookingLinks[locationId] ?? '').trim()
      const baseline = bookingLinkBaselineByLocationId.get(locationId) ?? ''
      return current !== baseline
    })
  }, [offeringLocationIds, bookingLinks, bookingLinkBaselineByLocationId])

  const hasCategoryChanges = !sameIds(categoryIds, originalCategoryIds)
  const canSave = formState.isDirty || hasCategoryChanges || hasBookingLinkChanges

  const colors = [
    'bg-indigo-500',
    'bg-violet-500',
    'bg-blue-500',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-pink-500',
    'bg-cyan-500',
  ]

  const providerName = provider?.name ?? ''
  const words = providerName.trim().split(/\s+/).filter(Boolean)
  const first = words[0]?.[0] ?? ''
  const last = words[words.length - 1]?.[0] ?? ''
  const initials = (words.length > 1 ? `${first}${last}` : first).toUpperCase()
  const colorIdx =
    providerName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length

  async function onSubmit(values: ProviderFormValues) {
    if (!id) return
    setIsSaving(true)

    const result = await updateProvider(id, {
      name: values.name.trim(),
      subtitle: values.subtitle.trim() || null,
      npi: values.npi.trim() || null,
      email: values.email.trim() || null,
      bio_link: values.bio_link.trim() || null,
      category_ids: categoryIds,
    })

    if (result.error) {
      toast.error(result.error)
      setIsSaving(false)
      return
    }

    for (const locationId of offeringLocationIds) {
      const link = bookingLinks[locationId]?.trim() ?? ''
      const saveResult = await upsertProviderLocation(id, locationId, link || null)
      if (saveResult.error) {
        toast.error(saveResult.error)
        setIsSaving(false)
        return
      }
    }

    await queryClient.invalidateQueries({ queryKey: ['provider', id] })
    await queryClient.invalidateQueries({ queryKey: ['providers', orgId] })
    await queryClient.invalidateQueries({ queryKey: ['provider-locations', id] })
    toast.success('Changes saved')
    reset(
      {
        name: values.name.trim(),
        subtitle: values.subtitle.trim(),
        npi: values.npi.trim(),
        email: values.email.trim(),
        bio_link: values.bio_link.trim(),
      },
      { keepDirty: false }
    )
    setOriginalCategoryIds(categoryIds)
    setIsSaving(false)
  }

  async function handlePhotoSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || !id || !orgId) return

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB')
      event.target.value = ''
      return
    }

    setIsUploadingPhoto(true)
    const result = await uploadProviderImage(id, orgId, file)
    setIsUploadingPhoto(false)
    event.target.value = ''

    if (result.error) {
      toast.error(result.error)
      return
    }

    await queryClient.invalidateQueries({ queryKey: ['provider', id] })
    await queryClient.invalidateQueries({ queryKey: ['providers', orgId] })
    toast.success('Photo updated')
  }

  async function handleArchive() {
    if (!id) return
    const confirmed = window.confirm('Archive this provider? They will be hidden from all widgets.')
    if (!confirmed) return

    const result = await archiveProvider(id)
    if (result.error) {
      toast.error(result.error)
      return
    }

    toast.success('Provider archived')
    navigate('/providers')
  }

  async function handleSaveOffering() {
    if (!id) return
    if (!offeringCaseTypeId) {
      setOfferingError('Case type is required')
      return
    }

    setOfferingSaving(true)
    setOfferingError('')

    if (modal.type === 'add-offering') {
      const result = await createOffering({
        provider_id: id,
        case_type_id: offeringCaseTypeId,
        org_id: orgId,
        location_ids: offeringDraftLocationIds,
        constraints: offeringConstraints,
      })
      if (result.error) {
        setOfferingError(result.error)
        setOfferingSaving(false)
        return
      }
    }

    if (modal.type === 'edit-offering' && modal.payload?.id) {
      const result = await updateOffering(modal.payload.id, {
        case_type_id: offeringCaseTypeId,
        location_ids: offeringDraftLocationIds,
        constraints: offeringConstraints,
      })
      if (result.error) {
        setOfferingError(result.error)
        setOfferingSaving(false)
        return
      }
    }

    await queryClient.invalidateQueries({ queryKey: ['provider-offerings', id] })
    const toastType = modal.type
    setModal({ type: null })
    toast.success(toastType === 'add-offering' ? 'Offering added' : 'Offering updated')
    setOfferingSaving(false)
  }

  if (providerLoading || categoriesLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!provider) {
    return (
      <div>
        <p className="text-lg font-semibold text-slate-900">Provider not found</p>
        <Link to="/providers" className="mt-3 inline-block text-sm text-indigo-600 hover:underline">
          Back to Providers
        </Link>
      </div>
    )
  }

  return (
    <>
    <div className="pt-16">
      <div className="fixed left-0 right-0 top-16 z-40 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4">
        <Link to="/providers" className="flex items-center gap-1 text-sm text-indigo-600 hover:underline">
          <ChevronLeft className="h-4 w-4" />
          Back to Providers
        </Link>
        <button
          type="button"
          onClick={() => void handleSubmit(onSubmit)()}
          disabled={!canSave || isSaving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="mb-6">
        <p className="text-sm text-slate-500">Providers → {provider.name}</p>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-8 md:flex-row">
          <div className="shrink-0">
            {provider.image_url ? (
              <img
                src={provider.image_url}
                alt={provider.name}
                className="h-32 w-32 rounded-full object-cover"
              />
            ) : (
              <div
                className={`flex h-32 w-32 items-center justify-center rounded-full text-2xl font-bold text-white ${colors[colorIdx]}`}
              >
                {initials}
              </div>
            )}
            <button
              type="button"
              className="mt-3 flex items-center gap-1 text-sm text-indigo-600 underline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingPhoto}
            >
              <Upload className="h-4 w-4" />
              {isUploadingPhoto ? 'Uploading...' : 'Upload Photo'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={handlePhotoSelect}
            />
          </div>

          <form className="flex-1" onSubmit={handleSubmit(onSubmit)}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  {...register('name', { required: true })}
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Subtitle / Credentials
                </label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  {...register('subtitle')}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">NPI</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  {...register('npi')}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  {...register('email')}
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Bio Link</label>
                <input
                  type="url"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  {...register('bio_link')}
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">Specialties</label>
              <div className="mb-2 flex flex-wrap gap-2">
                {categoryIds.map((categoryId) => {
                  const categoryName = categoryMap.get(categoryId)
                  if (!categoryName) return null
                  return (
                    <span
                      key={categoryId}
                      className="flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-1 text-xs text-indigo-700"
                    >
                      {categoryName}
                      <button
                        type="button"
                        className="text-indigo-600 hover:text-indigo-800"
                        onClick={() =>
                          setCategoryIds((prev) => prev.filter((existing) => existing !== categoryId))
                        }
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )
                })}
              </div>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value=""
                onChange={(event) => {
                  const categoryId = event.target.value
                  if (!categoryId) return
                  setCategoryIds((prev) => (prev.includes(categoryId) ? prev : [...prev, categoryId]))
                }}
              >
                <option value="">+ Add specialty</option>
                {unassignedCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

          </form>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-semibold text-slate-900">Locations &amp; Booking Links</h2>

        {providerLocationsLoading || orgLocationsLoading || offeringsLoading ? (
          <div className="py-8">
            <LoadingSpinner />
          </div>
        ) : offeringLocationIds.length === 0 ? (
          <div className="py-4">
            <p className="text-sm text-slate-500">
              No offering locations yet. Add locations to this provider&apos;s offerings to manage booking links.
            </p>
          </div>
        ) : (
          <div className="w-full">
            <div className="flex items-center gap-4 border-b border-slate-200 pb-2 text-xs uppercase tracking-wider text-slate-500">
              <div className="w-1/3">Location</div>
              <div className="flex-1">Booking Link</div>
            </div>

            {offeringLocationIds.map((locationId, index) => {
              const locationName = locationNameById.get(locationId) ?? 'Unknown location'

              return (
                <div
                  key={locationId}
                  className={[
                    'flex items-center gap-4 py-3',
                    index === offeringLocationIds.length - 1 ? '' : 'border-b border-slate-100',
                  ].join(' ')}
                >
                  <div className="w-1/3">
                    <span className="text-sm text-slate-700">{locationName}</span>
                  </div>

                  <div className="flex-1">
                    <input
                      type="text"
                      value={bookingLinks[locationId] ?? ''}
                      onChange={(event) =>
                        setBookingLinks((prev) => ({ ...prev, [locationId]: event.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Offerings</h2>
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white"
            onClick={() => setModal({ type: 'add-offering' })}
          >
            + Add Offering
          </button>
        </div>

        {offeringsLoading ? (
          <div className="py-8">
            <LoadingSpinner />
          </div>
        ) : offerings.length === 0 ? (
          <EmptyState
            icon={<Stethoscope className="h-10 w-10" />}
            title="No offerings yet"
            description="Add a case type this provider treats"
          />
        ) : (
          <div className="w-full">
            <div className="grid grid-cols-4 gap-4 border-b border-slate-200 pb-2 text-xs uppercase tracking-wider text-slate-500">
              <div>Case Type</div>
              <div>Locations</div>
              <div>Constraints</div>
              <div>Actions</div>
            </div>
            {offerings.map((offering, index) => {
              const locationNames = offering.location_ids
                .map((locationId) => locationNameById.get(locationId))
                .filter((name): name is string => Boolean(name))
              const constraintSummaryEntries = Object.entries(offering.constraints ?? {}).map(
                ([key, value]) => `${key}: ${String(value)}`
              )
              const constraintSummary = constraintSummaryEntries.join(', ')
              const displayConstraintSummary =
                constraintSummary.length > 40
                  ? `${constraintSummary.slice(0, 40)}...`
                  : constraintSummary || '—'

              return (
                <div
                  key={offering.id}
                  className={[
                    'grid grid-cols-4 items-center gap-4 py-3',
                    index === offerings.length - 1 ? '' : 'border-b border-slate-100',
                  ].join(' ')}
                >
                  <div className="text-sm font-medium text-slate-900">
                    {caseTypeNameById.get(offering.case_type_id) ?? 'Unknown'}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {locationNames.length === 0 ? (
                      <span className="text-sm text-slate-500">—</span>
                    ) : (
                      locationNames.map((name) => (
                        <span
                          key={`${offering.id}-${name}`}
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                        >
                          {name}
                        </span>
                      ))
                    )}
                  </div>
                  <div className="text-sm text-slate-600">{displayConstraintSummary}</div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setModal({ type: 'edit-offering', payload: offering })}
                    >
                      <Pencil className="h-4 w-4 cursor-pointer text-slate-400 hover:text-slate-600" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setModal({ type: 'delete-offering', payload: offering.id })}
                    >
                      <Trash2 className="h-4 w-4 cursor-pointer text-red-300 hover:text-red-500" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <button type="button" className="text-sm text-red-500 underline" onClick={handleArchive}>
        Archive Provider
      </button>
    </div>
    {(modal.type === 'add-offering' || modal.type === 'edit-offering') && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="absolute inset-0" onMouseDown={() => setModal({ type: null })} />
        <div
          className="relative mx-4 max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            {modal.type === 'add-offering' ? 'Add Offering' : 'Edit Offering'}
          </h2>

          {offeringError ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {offeringError}
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Case Type</label>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={offeringCaseTypeId}
              onChange={(e) => setOfferingCaseTypeId(e.target.value)}
            >
              <option value="">Select case type...</option>
              {orgCaseTypes.map((caseType) => (
                <option key={caseType.id} value={caseType.id}>
                  {caseType.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4">
            <label className="mb-2 block text-sm font-medium text-slate-700">Locations</label>
            <div className="space-y-2">
              {orgLocations.map((location) => (
                <label key={location.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={offeringDraftLocationIds.includes(location.id)}
                    onChange={(e) => {
                      setOfferingDraftLocationIds((prev) =>
                        e.target.checked
                          ? [...prev, location.id]
                          : prev.filter((existingId) => existingId !== location.id)
                      )
                    }}
                  />
                  {location.name}
                </label>
              ))}
            </div>
          </div>

          {orgConstraints.length > 0 ? (
            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">Constraints</label>
              <div className="space-y-3">
                {orgConstraints.map((constraint) => (
                  <div key={constraint.id}>
                    <p className="mb-1 text-sm text-slate-700">{constraint.name}</p>
                    {constraint.type === 'binary' ? (
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={offeringConstraints[constraint.mapped_key] === 1}
                          onChange={(e) =>
                            setOfferingConstraints((prev) => ({
                              ...prev,
                              [constraint.mapped_key]: e.target.checked ? 1 : 0,
                            }))
                          }
                        />
                        Enabled
                      </label>
                    ) : null}
                    {constraint.type === 'range' ? (
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          placeholder="Min"
                          value={offeringConstraints[constraint.mapped_key] ?? ''}
                          onChange={(e) =>
                            setOfferingConstraints((prev) => ({
                              ...prev,
                              [constraint.mapped_key]: e.target.value,
                            }))
                          }
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={offeringConstraints[constraint.secondary_mapped_key ?? ''] ?? ''}
                          onChange={(e) =>
                            setOfferingConstraints((prev) => ({
                              ...prev,
                              [constraint.secondary_mapped_key ?? '']: e.target.value,
                            }))
                          }
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                      </div>
                    ) : null}
                    {constraint.type === 'exact' ? (
                      <input
                        type="text"
                        value={offeringConstraints[constraint.mapped_key] ?? ''}
                        onChange={(e) =>
                          setOfferingConstraints((prev) => ({
                            ...prev,
                            [constraint.mapped_key]: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
              onClick={() => setModal({ type: null })}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={offeringSaving}
              onClick={handleSaveOffering}
            >
              {offeringSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    )}
    <ConfirmDialog
      isOpen={modal.type === 'delete-offering'}
      title="Remove Offering"
      message="Remove this offering? This cannot be undone."
      confirmLabel="Remove"
      confirmVariant="danger"
      onConfirm={async () => {
        const result = await archiveOffering(modal.payload)
        if (!result.error) {
          queryClient.invalidateQueries({ queryKey: ['provider-offerings', id] })
          toast.success('Offering removed')
        }
        setModal({ type: null })
      }}
      onCancel={() => setModal({ type: null })}
    />
    </>
  )
}

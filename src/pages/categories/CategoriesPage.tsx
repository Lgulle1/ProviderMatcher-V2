import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Archive, GripVertical, Pencil, Plus, Tag } from 'lucide-react'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import EmptyState from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/Toast'
import {
  archiveCategory,
  createCategory,
  getCategories,
  getCategoryOfferingCount,
  updateCategory,
  updateCategoryOrders,
} from '../../lib/api/categories'
import { useAuthStore } from '../../stores/authStore'
import type { Category } from '../../types/database'

type CategoryRow = { category: Category; offeringCount: number }

const EMPTY_CATEGORY_ROWS: CategoryRow[] = []

function SortableCategoryRow({
  category,
  offeringCount,
  onEdit,
  onArchive,
}: {
  category: Category
  offeringCount: number
  onEdit: () => void
  onArchive: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="mb-2 flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3"
    >
      <button
        type="button"
        className="touch-none cursor-grab text-slate-300 hover:text-slate-400 active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <span className="flex-1 text-sm font-medium text-slate-900">{category.name}</span>
      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
        {offeringCount}
      </span>
      <button
        type="button"
        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
        aria-label="Edit category"
        onClick={onEdit}
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-red-600"
        aria-label="Archive category"
        onClick={onArchive}
      >
        <Archive className="h-4 w-4" />
      </button>
    </div>
  )
}

export default function CategoriesPage() {
  const orgId = useAuthStore((s) => s.org?.id ?? '')
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [modal, setModal] = useState<{ type: 'add' | 'edit' | 'archive' | null; payload?: Category }>({
    type: null,
  })
  const [name, setName] = useState('')
  const [formError, setFormError] = useState('')
  const [saveLoading, setSaveLoading] = useState(false)
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [items, setItems] = useState<Category[]>([])

  const { data, isLoading } = useQuery({
    queryKey: ['categories', orgId],
    queryFn: async () => {
      const cats = await getCategories(orgId)
      const counts = await Promise.all(cats.map((c) => getCategoryOfferingCount(c.id)))
      return cats.map((category, i) => ({
        category,
        offeringCount: counts[i],
      }))
    },
    enabled: Boolean(orgId),
  })

  const rows = data ?? EMPTY_CATEGORY_ROWS

  useEffect(() => {
    setItems(rows.map((r) => r.category))
  }, [rows])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    if (modal.type === null) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setModal({ type: null })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [modal.type])

  useEffect(() => {
    if (modal.type !== null) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [modal.type])

  useEffect(() => {
    if (modal.type === 'add') {
      setName('')
      setFormError('')
    } else if (modal.type === 'edit' && modal.payload) {
      setName(modal.payload.name)
      setFormError('')
    }
  }, [modal])

  const archivePayload = modal.type === 'archive' ? modal.payload : undefined
  const archiveOfferingCount = archivePayload
    ? rows.find((r) => r.category.id === archivePayload.id)?.offeringCount ?? 0
    : 0

  function validateName(value: string): string | null {
    const t = value.trim()
    if (!t) {
      return 'Name is required'
    }
    if (t.length < 2) {
      return 'Name must be at least 2 characters'
    }
    const excludeId = modal.type === 'edit' && modal.payload ? modal.payload.id : undefined
    const dup = items.some(
      (c) => c.id !== excludeId && c.name.trim().toLowerCase() === t.toLowerCase()
    )
    if (dup) {
      return 'A category with this name already exists'
    }
    return null
  }

  async function handleSaveAddOrEdit() {
    if (!orgId) {
      setFormError('Organization not found')
      return
    }
    const err = validateName(name)
    if (err) {
      setFormError(err)
      return
    }

    setFormError('')
    setSaveLoading(true)

    if (modal.type === 'edit' && !modal.payload) {
      setSaveLoading(false)
      return
    }

    if (modal.type === 'add') {
      const { error } = await createCategory(orgId, name.trim())
      setSaveLoading(false)
      if (error) {
        setFormError(error)
        return
      }
      await queryClient.invalidateQueries({ queryKey: ['categories', orgId] })
      setModal({ type: null })
      toast.success('Category added')
      return
    }

    if (modal.type === 'edit' && modal.payload) {
      const { error } = await updateCategory(modal.payload.id, name.trim())
      setSaveLoading(false)
      if (error) {
        setFormError(error)
        return
      }
      await queryClient.invalidateQueries({ queryKey: ['categories', orgId] })
      setModal({ type: null })
      toast.success('Category updated')
    }
  }

  async function handleConfirmArchive() {
    if (modal.type !== 'archive' || !modal.payload) {
      return
    }
    const { id } = modal.payload
    setArchiveLoading(true)
    const { error } = await archiveCategory(id)
    setArchiveLoading(false)
    if (error) {
      toast.error(error)
      return
    }
    await queryClient.invalidateQueries({ queryKey: ['categories', orgId] })
    setModal({ type: null })
    toast.success('Category archived')
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) {
      return
    }
    const oldIndex = items.findIndex((i) => i.id === active.id)
    const newIndex = items.findIndex((i) => i.id === over.id)
    if (oldIndex < 0 || newIndex < 0) {
      return
    }

    const previous = [...items]
    const next = arrayMove(items, oldIndex, newIndex)
    setItems(next)

    const updates = next.map((c, idx) => ({ id: c.id, sort_order: idx }))
    const { error } = await updateCategoryOrders(updates)
    if (error) {
      setItems(previous)
      toast.error(error)
      return
    }
    await queryClient.invalidateQueries({ queryKey: ['categories', orgId] })
  }

  return (
    <div>
      <div className="mb-6 flex justify-end">
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          onClick={() => setModal({ type: 'add' })}
        >
          <Plus className="h-4 w-4" />
          + Add Category
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading categories…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Tag className="h-10 w-10" />}
          title="No categories yet"
          description="Add categories like Sports Medicine, Joint Replacement"
          action={
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              onClick={() => setModal({ type: 'add' })}
            >
              + Add Category
            </button>
          }
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {items.map((category) => {
              const offeringCount =
                rows.find((r) => r.category.id === category.id)?.offeringCount ?? 0
              return (
                <SortableCategoryRow
                  key={category.id}
                  category={category}
                  offeringCount={offeringCount}
                  onEdit={() => setModal({ type: 'edit', payload: category })}
                  onArchive={() => setModal({ type: 'archive', payload: category })}
                />
              )
            })}
          </SortableContext>
        </DndContext>
      )}

      {modal.type === 'add' || modal.type === 'edit' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onMouseDown={() => setModal({ type: null })} />
          <div
            className="relative mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              {modal.type === 'add' ? 'Add Category' : 'Edit Category'}
            </h2>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {formError ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setModal({ type: null })}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
                disabled={saveLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAddOrEdit}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                disabled={saveLoading}
              >
                {saveLoading ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={modal.type === 'archive'}
        title="Archive Category"
        message={
          modal.type === 'archive' && modal.payload
            ? archiveOfferingCount > 0
              ? `Archive ${modal.payload.name}? This category is used in ${archiveOfferingCount} offerings.`
              : `Archive ${modal.payload.name}?`
            : ''
        }
        confirmLabel="Archive"
        confirmVariant="danger"
        isLoading={archiveLoading}
        onConfirm={handleConfirmArchive}
        onCancel={() => setModal({ type: null })}
      />
    </div>
  )
}

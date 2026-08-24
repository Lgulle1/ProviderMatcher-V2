import { Tag } from 'lucide-react'
import SortableEntityListPage from '../../components/shared/SortableEntityListPage'
import {
  archiveCategory,
  createCategory,
  getCategories,
  getCategoryOfferingCount,
  updateCategory,
  updateCategoryOrders,
} from '../../lib/api/categories'
import type { Category } from '../../types/database'

export default function CategoriesPage() {
  return (
    <SortableEntityListPage<Category>
      // This page caches counts-augmented rows, so it cannot share the plain
      // ['categories', orgId] key that ProvidersPage, LogicTester,
      // DataTablePage and ProviderProfilePage read Category[] from.
      queryKey="categories-with-counts"
      alsoInvalidate={['categories']}
      api={{
        list: getCategories,
        offeringCount: getCategoryOfferingCount,
        create: createCategory,
        update: updateCategory,
        updateOrders: updateCategoryOrders,
        archive: archiveCategory,
      }}
      copy={{
        singular: 'Category',
        singularLower: 'category',
        pluralLower: 'categories',
        emptyDescription: 'Add categories like Sports Medicine, Joint Replacement',
      }}
      icon={<Tag className="h-10 w-10" />}
    />
  )
}

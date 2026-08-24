import { Stethoscope } from 'lucide-react'
import SortableEntityListPage from '../../components/shared/SortableEntityListPage'
import {
  archiveCaseType,
  createCaseType,
  getCaseTypeOfferingCount,
  getCaseTypes,
  updateCaseType,
  updateCaseTypeOrders,
} from '../../lib/api/caseTypes'
import type { CaseType } from '../../types/database'

export default function CaseTypesPage() {
  return (
    <SortableEntityListPage<CaseType>
      // This page caches counts-augmented rows, so it cannot share the plain
      // ['case-types', orgId] key that LogicTester, DataTablePage,
      // ProviderProfilePage and WidgetBuilderPage read CaseType[] from.
      queryKey="case-types-with-counts"
      alsoInvalidate={['case-types']}
      api={{
        list: getCaseTypes,
        offeringCount: getCaseTypeOfferingCount,
        create: createCaseType,
        update: updateCaseType,
        updateOrders: updateCaseTypeOrders,
        archive: archiveCaseType,
      }}
      copy={{
        singular: 'Case Type',
        singularLower: 'case type',
        pluralLower: 'case types',
        emptyDescription: 'Add case types like Knee, Shoulder, Hip',
      }}
      icon={<Stethoscope className="h-10 w-10" />}
    />
  )
}

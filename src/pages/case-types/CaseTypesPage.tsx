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
      // Hyphenated, unlike the 'categories' key -- other code invalidates this
      // exact string, so it must stay as it was.
      queryKey="case-types"
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

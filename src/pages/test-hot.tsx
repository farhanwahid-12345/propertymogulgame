import { HeadsOfTermsDialog } from "@/components/game/heads-of-terms-dialog";

const sampleTenant = {
  id: "test-tenant-1",
  name: "Blue Chip Logistics Ltd",
  companyName: "Blue Chip Logistics Ltd",
  profile: "premium" as const,
  creditScore: 850,
  monthlyIncome: 25000,
  employmentStatus: "limited_company",
  rentMultiplier: 1.25,
  defaultRisk: 0.02,
  damageRisk: 0.8,
  description: "National distribution firm seeking a long-term warehouse lease with strong covenant backing.",
  traits: [],
  covenantStrength: 85,
  sector: "logistics" as const,
  isNational: true,
};

export default function TestHotPage() {
  return (
    <div className="min-h-screen bg-background p-4">
      <h1 className="text-lg font-semibold mb-4">Heads of Terms Dialog Test</h1>
      <HeadsOfTermsDialog
        open={true}
        onOpenChange={() => {}}
        propertyId="test-prop"
        propertyName="Unit 4A, Cargo Way, Middlesbrough"
        tenant={sampleTenant}
        askingRentPennies={120000}
        monthsPlayed={0}
        onSign={() => {}}
      />
    </div>
  );
}

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Users, AlertTriangle, Shield, Star, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Tenant {
  id: string;
  name: string;
  profile: "premium" | "standard" | "budget" | "risky";
  creditScore: number;
  monthlyIncome: number;
  employmentStatus: string;
  rentMultiplier: number;
  defaultRisk: number; // 0-100%
  damageRisk: number; // 0-100%
  description: string;
}

interface TenantSelectorProps {
  propertyId: string;
  baseRent: number;
  onSelectTenant: (propertyId: string, tenant: Tenant) => void;
  currentTenant?: Tenant;
}

// Generate dynamic tenant pools
const generateTenantProfiles = (): Tenant[] => {
  const firstNames = ["James", "Sarah", "Michael", "Emma", "David", "Lisa", "John", "Kate", "Tom", "Sophie", "Alex", "Rachel", "Ben", "Amy", "Chris", "Lucy"];
  const lastNames = ["Smith", "Jones", "Brown", "Wilson", "Taylor", "Davies", "Evans", "Thomas", "Roberts", "Johnson", "Williams", "Miller", "Davis", "Garcia", "Rodriguez", "Martinez"];
  
  const getRandomName = () => {
    const first = firstNames[Math.floor(Math.random() * firstNames.length)];
    const last = lastNames[Math.floor(Math.random() * lastNames.length)];
    return `${first} ${last}`;
  };

  const profiles = [
    // Premium tenants (2-3 available)
    ...Array.from({ length: 2 + Math.floor(Math.random() * 2) }, (_, i) => ({
      id: `premium_${i + 1}`,
      name: getRandomName(),
      profile: "premium" as const,
      creditScore: 720 + Math.floor(Math.random() * 80),
      monthlyIncome: 6500 + Math.floor(Math.random() * 3000),
      employmentStatus: ["NHS Doctor", "Senior Engineer", "Solicitor", "University Professor", "Consultant"][Math.floor(Math.random() * 5)],
      rentMultiplier: 1.15 + Math.random() * 0.1,
      defaultRisk: 1 + Math.floor(Math.random() * 3),
      damageRisk: 1 + Math.floor(Math.random() * 2),
      description: "High-income professional with excellent credit history"
    })),
    
    // Standard tenants (3-4 available)
    ...Array.from({ length: 3 + Math.floor(Math.random() * 2) }, (_, i) => ({
      id: `standard_${i + 1}`,
      name: getRandomName(),
      profile: "standard" as const,
      creditScore: 620 + Math.floor(Math.random() * 80),
      monthlyIncome: 3500 + Math.floor(Math.random() * 2000),
      employmentStatus: ["Teacher", "Nurse", "Accountant", "Manager", "Civil Servant"][Math.floor(Math.random() * 5)],
      rentMultiplier: 0.95 + Math.random() * 0.15,
      defaultRisk: 5 + Math.floor(Math.random() * 10),
      damageRisk: 3 + Math.floor(Math.random() * 8),
      description: "Stable employment with good references"
    })),
    
    // Budget tenants (2-3 available)  
    ...Array.from({ length: 2 + Math.floor(Math.random() * 2) }, (_, i) => ({
      id: `budget_${i + 1}`,
      name: getRandomName(),
      profile: "budget" as const,
      creditScore: 520 + Math.floor(Math.random() * 80),
      monthlyIncome: 2200 + Math.floor(Math.random() * 1200),
      employmentStatus: ["Shop Worker", "Warehouse Staff", "Care Worker", "Security Guard", "Cleaner"][Math.floor(Math.random() * 5)],
      rentMultiplier: 0.8 + Math.random() * 0.15,
      defaultRisk: 15 + Math.floor(Math.random() * 15),
      damageRisk: 8 + Math.floor(Math.random() * 12),
      description: "Lower income but employed and willing to pay market rate"
    })),
    
    // Risky tenants (1-2 available, but pay MORE)
    ...Array.from({ length: 1 + Math.floor(Math.random() * 2) }, (_, i) => ({
      id: `risky_${i + 1}`,
      name: getRandomName(),
      profile: "risky" as const,
      creditScore: 420 + Math.floor(Math.random() * 120),
      monthlyIncome: 1800 + Math.floor(Math.random() * 1000),
      employmentStatus: ["Unemployed", "Temporary Work", "Benefits", "Gig Work", "Part-time"][Math.floor(Math.random() * 5)],
      rentMultiplier: 1.1 + Math.random() * 0.3, // Risky tenants pay MORE
      defaultRisk: 25 + Math.floor(Math.random() * 25),
      damageRisk: 15 + Math.floor(Math.random() * 25),
      description: "Higher risk but willing to pay premium rent for accommodation"
    }))
  ];
  
  return profiles;
};

const ProfileColors = {
  premium: "text-luxury border-luxury/20 bg-luxury/5",
  standard: "text-primary border-primary/20 bg-primary/5",
  budget: "text-secondary border-secondary/20 bg-secondary/5", 
  risky: "text-danger border-danger/20 bg-danger/5"
};

const ProfileIcons = {
  premium: Star,
  standard: Shield,
  budget: Users,
  risky: AlertTriangle
};

export function TenantSelector({ propertyId, baseRent, onSelectTenant, currentTenant }: TenantSelectorProps) {
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [tenantProfiles] = useState(() => generateTenantProfiles());

  const handleSelectTenant = () => {
    if (selectedTenant) {
      onSelectTenant(propertyId, selectedTenant);
      setIsOpen(false);
      setSelectedTenant(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          {currentTenant ? (
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              {currentTenant.name}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Select Tenant
            </div>
          )}
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Choose Tenant for Property</DialogTitle>
          <p className="text-sm text-muted-foreground mt-2">
            All tenants will pay £{baseRent}/mo (fixed based on property yield). Rent increases 3% annually.
          </p>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tenantProfiles.map((tenant) => {
            const Icon = ProfileIcons[tenant.profile];
            const isSelected = selectedTenant?.id === tenant.id;
            
            return (
              <Card 
                key={tenant.id}
                className={cn(
                  "cursor-pointer transition-all hover:shadow-md",
                  isSelected && "ring-2 ring-primary",
                  ProfileColors[tenant.profile]
                )}
                onClick={() => setSelectedTenant(tenant)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5" />
                      <CardTitle className="text-lg">{tenant.name}</CardTitle>
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {tenant.profile}
                    </Badge>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{tenant.description}</p>
                  
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="font-medium">Credit Score:</span>
                      <br />
                      <span className={cn(
                        tenant.creditScore >= 700 ? "text-success" :
                        tenant.creditScore >= 600 ? "text-warning" : "text-danger"
                      )}>
                        {tenant.creditScore}
                      </span>
                    </div>
                    
                    <div>
                      <span className="font-medium">Monthly Income:</span>
                      <br />
                      £{tenant.monthlyIncome.toLocaleString()}
                    </div>
                    
                    <div>
                      <span className="font-medium">Employment:</span>
                      <br />
                      {tenant.employmentStatus}
                    </div>
                    
                    <div>
                      <span className="font-medium">Fixed Rent:</span>
                      <br />
                      <span className="text-success font-semibold">
                        £{baseRent}/mo
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 text-danger" />
                      <span>Default Risk: {tenant.defaultRisk}%</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 text-warning" />
                      <span>Damage Risk: {tenant.damageRisk}%</span>
                    </div>
                  </div>
                  
                  <div className="pt-2">
                    <div className="flex items-center gap-1 text-sm">
                      <DollarSign className="h-4 w-4 text-success" />
                      <span>Rent Multiplier: {(tenant.rentMultiplier * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSelectTenant}
            disabled={!selectedTenant}
          >
            Select Tenant
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
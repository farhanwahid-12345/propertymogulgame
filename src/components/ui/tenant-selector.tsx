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

const TENANT_PROFILES: Tenant[] = [
  {
    id: "premium_1",
    name: "Dr. Sarah Mitchell",
    profile: "premium",
    creditScore: 780,
    monthlyIncome: 8500,
    employmentStatus: "NHS Consultant",
    rentMultiplier: 1.2,
    defaultRisk: 2,
    damageRisk: 1,
    description: "Professional tenant with excellent credit and stable income"
  },
  {
    id: "premium_2", 
    name: "James & Emma Thompson",
    profile: "premium",
    creditScore: 745,
    monthlyIncome: 7200,
    employmentStatus: "IT Managers",
    rentMultiplier: 1.15,
    defaultRisk: 3,
    damageRisk: 2,
    description: "Young professional couple, dual income, no pets"
  },
  {
    id: "standard_1",
    name: "Michael Brown",
    profile: "standard",
    creditScore: 680,
    monthlyIncome: 4200,
    employmentStatus: "Teacher",
    rentMultiplier: 1.0,
    defaultRisk: 8,
    damageRisk: 5,
    description: "Reliable professional with steady employment"
  },
  {
    id: "standard_2",
    name: "Lisa & Tom Wilson",
    profile: "standard",
    creditScore: 650,
    monthlyIncome: 5100,
    employmentStatus: "Retail Managers",
    rentMultiplier: 1.05,
    defaultRisk: 12,
    damageRisk: 8,
    description: "Family with children, good references"
  },
  {
    id: "budget_1",
    name: "Gary Jenkins",
    profile: "budget",
    creditScore: 590,
    monthlyIncome: 2800,
    employmentStatus: "Factory Worker",
    rentMultiplier: 0.9,
    defaultRisk: 25,
    damageRisk: 15,
    description: "Working class tenant, limited income but employed"
  },
  {
    id: "budget_2",
    name: "Sophie Martinez",
    profile: "budget",
    creditScore: 610,
    monthlyIncome: 3200,
    employmentStatus: "Part-time Carer",
    rentMultiplier: 0.85,
    defaultRisk: 20,
    damageRisk: 12,
    description: "Single mother, part-time work, housing benefit"
  },
  {
    id: "risky_1",
    name: "Danny O'Connor",
    profile: "risky", 
    creditScore: 480,
    monthlyIncome: 2100,
    employmentStatus: "Unemployed",
    rentMultiplier: 0.7,
    defaultRisk: 45,
    damageRisk: 35,
    description: "Recently unemployed, poor credit history"
  },
  {
    id: "risky_2",
    name: "Mark Stevens",
    profile: "risky",
    creditScore: 520,
    monthlyIncome: 2500,
    employmentStatus: "Temporary Work",
    rentMultiplier: 0.75,
    defaultRisk: 40,
    damageRisk: 30,
    description: "Inconsistent employment, previous arrears"
  }
];

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
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TENANT_PROFILES.map((tenant) => {
            const Icon = ProfileIcons[tenant.profile];
            const potentialRent = Math.floor(baseRent * tenant.rentMultiplier);
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
                      <span className="font-medium">Potential Rent:</span>
                      <br />
                      <span className="text-success font-semibold">
                        £{potentialRent}/mo
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
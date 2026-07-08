import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TenantSelector, type Tenant } from "@/components/game/tenant-selector";
import { EvictionDialog } from "@/components/game/eviction-dialog";
import { RentNegotiationDialog } from "@/components/game/rent-negotiation-dialog";
import { TitleSplitDialog } from "@/components/game/title-split-dialog";
import { Heart, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMarketRentPounds } from "@/lib/engine/market";



export interface MultiUnitSlot {
  slotIndex: number;
  tenant?: Tenant;
  satisfaction?: number;
  satisfactionReasons?: Array<{ reason: string; delta: number }>;
  rentPounds?: number;
  pendingEviction?: {
    ground: 'rent_arrears' | 'landlord_sale' | 'landlord_move_in' | 'antisocial_behaviour' | 'lease_expiry' | 'tenant_default' | 'break_clause' | 'commercial_forfeiture';
    effectiveMonth: number;
    servedMonth: number;
  };
}

interface Props {
  propertyId: string;
  propertyName: string;
  subtype: 'hmo' | 'flats';
  baseRentPerUnitPounds: number;
  propertyValue: number;
  propertyYield?: number;
  condition: any;
  conditionScore: number;
  monthsPlayed: number;
  playerCash: number;
  slots: MultiUnitSlot[];
  /** monthsPlayed snapshot of last rent increase on this property; used to enforce the 12-month Section 13 cap. */
  lastRentIncreaseMonth?: number;
  onSelectTenant: (propertyId: string, tenant: Tenant, slotIndex?: number) => void;
  evictTenant?: (propertyId: string, ground: any, slotIndex?: number) => void;
  cancelEviction?: (propertyId: string, slotIndex?: number) => void;
  applyRentIncrease?: (
    propertyId: string,
    newRentPounds: number,
    outcome: 'accepted' | 'counter_accepted' | 'tribunal_landlord' | 'tribunal_tenant',
    tribunalFeePounds: number,
    slotIndex?: number,
  ) => void;
  furnishingTier?: 'unfurnished' | 'part_furnished' | 'fully_furnished';
  /** Phase 4 #2 — title-split a converted flat into its own leasehold property. */
  onSplitFlatUnit?: (propertyId: string, slotIndex: number, groundRentMode: 'peppercorn' | 'percent') => void;
}

export function MultiUnitSlots({
  propertyId,
  propertyName,
  subtype,
  baseRentPerUnitPounds,
  propertyValue,
  propertyYield,
  condition,
  conditionScore,
  monthsPlayed,
  playerCash,
  slots,
  lastRentIncreaseMonth,
  onSelectTenant,
  evictTenant,
  cancelEviction,
  applyRentIncrease,
  furnishingTier,
  onSplitFlatUnit,
}: Props) {
  const label = subtype === 'hmo' ? 'Room' : 'Unit';
  const occupied = slots.filter(s => s.tenant).length;
  // Item #12: attention pulse when any slot needs landlord action.
  const needsAttention = slots.some(s =>
    (s.satisfaction !== undefined && s.satisfaction < 40) || !!s.pendingEviction
  );
  const [collapsed, setCollapsed] = useState(slots.length > 3);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className={cn(
          "w-full flex items-center justify-between rounded-md px-2 py-1 hover:bg-muted/30 transition",
          needsAttention && "animate-pulse"
        )}
      >
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {collapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          {subtype === 'hmo' ? 'HMO Rooms' : 'Converted Units'}
          {needsAttention && <span className="text-red-400 normal-case">· Needs attention</span>}
        </div>
        <Badge variant="outline" className="text-[10px]">
          {occupied}/{slots.length} occupied
        </Badge>
      </button>

      {!collapsed && (
      <div className="space-y-2">

        {slots.map(slot => {
          const slotIndex = slot.slotIndex;
          const tenant = slot.tenant;
          const slotRent = slot.rentPounds ?? 0;

          return (
            <div
              key={slotIndex}
              className="rounded-lg border border-border/60 bg-muted/20 p-2 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium">
                  {label} {slotIndex + 1}
                  {tenant ? (
                    <span className="ml-2 text-muted-foreground">— {tenant.name}</span>
                  ) : (
                    <span className="ml-2 text-muted-foreground italic">Vacant</span>
                  )}
                </div>
                {tenant && slotRent > 0 && (
                  <span className="text-xs font-semibold text-success">
                    £{slotRent.toLocaleString()}/mo
                  </span>
                )}
              </div>

              {tenant && typeof slot.satisfaction === 'number' && (
                <div className="flex items-center gap-2">
                  <Heart className={cn(
                    "h-3 w-3 shrink-0",
                    slot.satisfaction >= 70 ? "text-emerald-400 fill-emerald-400/30" :
                    slot.satisfaction >= 40 ? "text-amber-400 fill-amber-400/30" :
                    "text-red-400 fill-red-400/30"
                  )} />
                  <div
                    className="flex-1 h-1 bg-muted rounded-full overflow-hidden"
                    role="progressbar"
                    aria-valuenow={Math.round(slot.satisfaction)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Tenant satisfaction"
                  >
                    <div
                      className={cn(
                        "h-full",
                        slot.satisfaction >= 70 ? "bg-emerald-400" :
                        slot.satisfaction >= 40 ? "bg-amber-400" :
                        "bg-red-400"
                      )}
                      style={{ width: `${slot.satisfaction}%` }}
                    />
                  </div>

                  <span className="text-[10px] text-muted-foreground tabular-nums w-7 text-right">
                    {Math.round(slot.satisfaction)}%
                  </span>
                </div>
              )}

              {/* Eviction notice banner */}
              {tenant && slot.pendingEviction && (
                <div className="rounded border border-destructive/40 bg-destructive/10 p-1.5 flex items-center justify-between gap-2">
                  <div className="text-[10px]">
                    <span className="font-semibold text-destructive">Eviction served</span>
                    <span className="text-muted-foreground ml-1">
                      ({slot.pendingEviction.ground.replace(/_/g, ' ')}) · vacates mo {slot.pendingEviction.effectiveMonth}
                    </span>
                  </div>
                  {cancelEviction && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-[10px] h-6 px-2"
                      onClick={() => cancelEviction(propertyId, slotIndex)}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              )}

              {/* Vacant slot — TenantSelector */}
              {!tenant && (
                <TenantSelector
                  propertyId={propertyId}
                  baseRent={baseRentPerUnitPounds}
                  onSelectTenant={(pid, t) => onSelectTenant(pid, t, slotIndex)}
                  monthsPlayed={monthsPlayed}
                  condition={condition}
                  conditionScore={conditionScore}
                  propertyValue={propertyValue}
                  propertyYield={propertyYield}
                  furnishingTier={furnishingTier}
                />
              )}

              {/* Occupied slot — rent + eviction actions */}
              {tenant && !slot.pendingEviction && evictTenant && (
                <div className="grid grid-cols-2 gap-1.5">
                  {applyRentIncrease && (
                    <RentNegotiationDialog
                      propertyId={propertyId}
                      propertyName={`${propertyName} · ${label} ${slotIndex + 1}`}
                      // Phase 2 #10 — slot-specific rent (rentPennies/100 for this propertyId+slotIndex)
                      // instead of property.monthlyIncome, which is the SUM across all units and
                      // produced false-positive "raise rent" comparisons on flats/HMOs.
                      currentRent={slot.rentPounds ?? baseRentPerUnitPounds}
                      marketRent={(() => {
                        // Market rent is for the *whole* property — divide by
                        // unit count so a single room/flat compares like-for-like.
                        const units = Math.max(1, slots.length);
                        const unitCurrent = slot.rentPounds ?? baseRentPerUnitPounds;
                        const whole = getMarketRentPounds({
                          value: propertyValue,
                          yield: propertyYield,
                          condition,
                          subtype,
                          subtypeUnits: units,
                          furnishingTier,
                          // Phase 2 #9a — anchor against current per-unit rent so
                          // Section 13 comparator is realistic on sitting tenants.
                          currentRentPounds: unitCurrent * units,
                          baselineRentPounds: baseRentPerUnitPounds * units,
                        });
                        return whole > 0
                          ? Math.round(whole / units)
                          : baseRentPerUnitPounds;
                      })()}

                      monthsSinceLastIncrease={
                        lastRentIncreaseMonth !== undefined
                          ? Math.max(0, monthsPlayed - lastRentIncreaseMonth)
                          : 999
                      }
                      tenant={tenant}
                      tenantSatisfaction={slot.satisfaction ?? 80}
                      playerCash={playerCash}
                      onApply={(pid, newRent, outcome, fee) =>
                        applyRentIncrease(pid, newRent, outcome, fee, slotIndex)
                      }
                    />
                  )}
                  <EvictionDialog
                    propertyId={propertyId}
                    propertyName={`${propertyName} · ${label} ${slotIndex + 1}`}
                    tenantName={tenant.name}
                    tenantProfile={tenant.profile}
                    rentArrearsCount={0}
                    hasLongstandingASB={false}
                    onEvict={(pid, ground) => evictTenant(pid, ground, slotIndex)}
                  />
                </div>
              )}

              {subtype === 'flats' && onSplitFlatUnit && (
                <TitleSplitDialog
                  propertyId={propertyId}
                  propertyName={propertyName}
                  slotIndex={slotIndex}
                  unitValuePounds={
                    propertyValue && slots.length > 0
                      ? Math.round((propertyValue / slots.length) * 1.08)
                      : undefined
                  }
                  onConfirm={onSplitFlatUnit}
                />
              )}

            </div>
          );
        })}
      </div>
      )}
    </div>

  );
}

import { describe, expect, it, vi } from 'vitest';

import { chargeBusinessEnrichment, ENGINEER_DETAILS_EVENT, QUALIFICATION_DETAILS_EVENT } from '../src/pricing.js';
import type { Business } from '../src/crawler.js';

const business = (engineers: Business['engineers'], qualifications: Business['qualifications']) => ({
    business_name: 'Test Heating',
    registration_number: '123456',
    engineers,
    qualifications,
} as Business);

function chargingManager(events: Record<string, number>, isPayPerEvent = true) {
    return {
        getPricingInfo: () => ({ isPayPerEvent, perEventPrices: events, pricingModel: 'PAY_PER_EVENT' as const, maxTotalChargeUsd: Infinity }),
        charge: vi.fn(async () => ({ chargedCount: 1, eventChargeLimitReached: false, chargeableWithinLimit: {} })),
    };
}

describe('optional enrichment event billing', () => {
    it('charges separate engineer and qualification events only when those rows exist', async () => {
        const charging = chargingManager({ [ENGINEER_DETAILS_EVENT]: 0.05, [QUALIFICATION_DETAILS_EVENT]: 0.05 });
        const result = await chargeBusinessEnrichment(charging, business([{} as Business['engineers'][number]], [{} as Business['qualifications'][number]]), {
            includeEngineers: true,
            includeQualifications: true,
        });

        expect(charging.charge).toHaveBeenNthCalledWith(1, { eventName: ENGINEER_DETAILS_EVENT });
        expect(charging.charge).toHaveBeenNthCalledWith(2, { eventName: QUALIFICATION_DETAILS_EVENT });
        expect(result.chargedEvents).toEqual([ENGINEER_DETAILS_EVENT, QUALIFICATION_DETAILS_EVENT]);
    });

    it('does not charge events users did not select or when the source returned no detail rows', async () => {
        const charging = chargingManager({ [ENGINEER_DETAILS_EVENT]: 0.05, [QUALIFICATION_DETAILS_EVENT]: 0.05 });
        const result = await chargeBusinessEnrichment(charging, business([], []), {
            includeEngineers: true,
            includeQualifications: true,
        });

        expect(charging.charge).not.toHaveBeenCalled();
        expect(result).toEqual({ chargedEvents: [], limitReachedEvents: [] });
    });

    it('ignores optional events while the pricing change is not active or for non-PPE runs', async () => {
        const pricingPending = chargingManager({});
        await chargeBusinessEnrichment(pricingPending, business([{} as Business['engineers'][number]], [{} as Business['qualifications'][number]]), {
            includeEngineers: true,
            includeQualifications: true,
        });
        expect(pricingPending.charge).not.toHaveBeenCalled();

        const notPpe = chargingManager({ [ENGINEER_DETAILS_EVENT]: 0.05 }, false);
        await chargeBusinessEnrichment(notPpe, business([{} as Business['engineers'][number]], []), {
            includeEngineers: true,
            includeQualifications: false,
        });
        expect(notPpe.charge).not.toHaveBeenCalled();
    });

    it('reports an optional event blocked by the per-run spending limit', async () => {
        const charging = chargingManager({ [ENGINEER_DETAILS_EVENT]: 0.05 });
        charging.charge.mockResolvedValue({ chargedCount: 0, eventChargeLimitReached: true, chargeableWithinLimit: {} });
        const result = await chargeBusinessEnrichment(charging, business([{} as Business['engineers'][number]], []), {
            includeEngineers: true,
            includeQualifications: false,
        });

        expect(result).toEqual({ chargedEvents: [], limitReachedEvents: [ENGINEER_DETAILS_EVENT] });
    });
});

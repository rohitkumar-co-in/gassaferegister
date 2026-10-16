import type { ChargeResult, ChargingManager } from 'apify';

import type { Input } from './config.js';
import type { Business } from './crawler.js';

export const ENGINEER_DETAILS_EVENT = 'engineer-details';
export const QUALIFICATION_DETAILS_EVENT = 'qualification-details';

type ChargeManager = Pick<ChargingManager, 'getPricingInfo' | 'charge'>;

/** Charge optional enrichments only when the requested data is present in the saved result. */
export async function chargeBusinessEnrichment(
    charging: ChargeManager,
    business: Business,
    input: Pick<Input, 'includeEngineers' | 'includeQualifications'>,
): Promise<{ chargedEvents: string[]; limitReachedEvents: string[] }> {
    const pricing = charging.getPricingInfo();
    const chargedEvents: string[] = [];
    const limitReachedEvents: string[] = [];
    if (!pricing.isPayPerEvent) return { chargedEvents, limitReachedEvents };

    const chargeIfConfigured = async (eventName: string, requested: boolean, hasData: boolean) => {
        if (!requested || !hasData || !(pricing.perEventPrices[eventName] > 0)) return;
        const result: ChargeResult = await charging.charge({ eventName });
        if (result.chargedCount > 0) chargedEvents.push(eventName);
        if (result.eventChargeLimitReached && result.chargedCount === 0) limitReachedEvents.push(eventName);
    };

    await chargeIfConfigured(ENGINEER_DETAILS_EVENT, input.includeEngineers === true, business.engineers.length > 0);
    await chargeIfConfigured(QUALIFICATION_DETAILS_EVENT, input.includeQualifications === true, business.qualifications.length > 0);
    return { chargedEvents, limitReachedEvents };
}

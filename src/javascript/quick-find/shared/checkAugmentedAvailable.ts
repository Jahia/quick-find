import type { ApolloClientInstance } from "../../quick-find-providers/types.ts";
import { SITE_INDEX_QUERY } from "../../quick-find-providers/augmented/augmentedSearchQuery.ts";

const cache = new Map<string, boolean>();
const pending = new Map<string, Promise<boolean>>();

// Cache failed availability checks as `false` for this page session.
// This fail-closed behavior avoids repeated retries and keeps activation deterministic.

export function checkAugmentedAvailable(
  client: ApolloClientInstance,
  siteKey: string,
): Promise<boolean> {
  const cached = cache.get(siteKey);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }

  const inflight = pending.get(siteKey);
  if (inflight) {
    return inflight;
  }

  const promise = client
    .query<{ jcr: { nodeByPath: { isNodeType: boolean } } }>({
      query: SITE_INDEX_QUERY,
      variables: { path: `/sites/${siteKey}` },
      fetchPolicy: "cache-first",
    })
    .then((result) => {
      const indexed = result.data?.jcr?.nodeByPath?.isNodeType ?? false;
      cache.set(siteKey, indexed);
      pending.delete(siteKey);
      return indexed;
    })
    .catch(() => {
      cache.set(siteKey, false);
      pending.delete(siteKey);
      return false;
    });

  pending.set(siteKey, promise);
  return promise;
}

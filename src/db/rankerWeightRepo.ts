import { RECO_FEATURE_KEYS, type RecoFeatureKey } from "@/types/recommendation";
import type { SqlExecutor } from "./types";

interface RankerWeightRow {
  feature: string;
  weight: number;
  updated_at: string;
}

export interface RankerWeightRecord {
  feature: RecoFeatureKey;
  weight: number;
  updatedAt: string;
}

export type RankerWeightMap = Partial<Record<RecoFeatureKey, number>>;

export interface RankerWeightRepository {
  list(): Promise<RankerWeightRecord[]>;
  getWeights(): Promise<RankerWeightMap>;
  upsertMany(weights: RankerWeightMap, updatedAt: string): Promise<void>;
}

function isRecoFeatureKey(value: string): value is RecoFeatureKey {
  return RECO_FEATURE_KEYS.includes(value as RecoFeatureKey);
}

function parseRow(row: RankerWeightRow): RankerWeightRecord | null {
  if (!isRecoFeatureKey(row.feature)) {
    return null;
  }
  return {
    feature: row.feature,
    weight: row.weight,
    updatedAt: row.updated_at,
  };
}

export function createRankerWeightRepository(
  db: SqlExecutor,
): RankerWeightRepository {
  return {
    async list() {
      const rows = await db.select<RankerWeightRow[]>(
        `SELECT feature, weight, updated_at
           FROM ranker_weights
          ORDER BY feature ASC`,
      );
      return rows.flatMap((row) => {
        const parsed = parseRow(row);
        return parsed ? [parsed] : [];
      });
    },

    async getWeights() {
      const rows = await this.list();
      return rows.reduce((weights, row) => {
        return {
          ...weights,
          [row.feature]: row.weight,
        };
      }, {} as RankerWeightMap);
    },

    async upsertMany(weights, updatedAt) {
      const entries = RECO_FEATURE_KEYS.flatMap((feature) => {
        const weight = weights[feature];
        return typeof weight === "number" ? [{ feature, weight }] : [];
      });

      await Promise.all(
        entries.map((entry) =>
          db.execute(
            `INSERT INTO ranker_weights (feature, weight, updated_at)
             VALUES ($1, $2, $3)
             ON CONFLICT(feature) DO UPDATE SET
               weight = excluded.weight,
               updated_at = excluded.updated_at`,
            [entry.feature, entry.weight, updatedAt],
          ),
        ),
      );
    },
  };
}

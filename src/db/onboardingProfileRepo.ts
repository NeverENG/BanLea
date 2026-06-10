import {
  newOnboardingProfileSchema,
  onboardingProfileSchema,
  type NewOnboardingProfile,
  type OnboardingProfile,
} from "@/types/onboarding";
import type { SqlExecutor } from "./types";

interface OnboardingProfileRow {
  domain_id: string;
  goal: string;
  interests_json: string;
  background: string | null;
  updated_at: string;
}

export interface OnboardingProfileRepository {
  getByDomain(domain: string): Promise<OnboardingProfile | null>;
  upsert(input: NewOnboardingProfile): Promise<OnboardingProfile>;
}

function parseInterests(value: string): string[] {
  const parsed = JSON.parse(value) as unknown;
  if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
    return parsed;
  }
  throw new Error("onboarding interests_json must be a JSON string array");
}

function parseOnboardingProfileRow(row: OnboardingProfileRow): OnboardingProfile {
  return onboardingProfileSchema.parse({
    domain: row.domain_id,
    goal: row.goal,
    interests: parseInterests(row.interests_json),
    background: row.background,
    updatedAt: row.updated_at,
  });
}

export function createOnboardingProfileRepository(
  db: SqlExecutor,
): OnboardingProfileRepository {
  return {
    async getByDomain(domain) {
      const rows = await db.select<OnboardingProfileRow[]>(
        `SELECT domain_id, goal, interests_json, background, updated_at
           FROM onboarding_profiles
          WHERE domain_id = $1
          LIMIT 1`,
        [domain],
      );
      return rows[0] ? parseOnboardingProfileRow(rows[0]) : null;
    },

    async upsert(input) {
      const profile = newOnboardingProfileSchema.parse(input);
      await db.execute(
        `INSERT INTO onboarding_profiles
          (domain_id, goal, interests_json, background, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT(domain_id) DO UPDATE SET
           goal = excluded.goal,
           interests_json = excluded.interests_json,
           background = excluded.background,
           updated_at = excluded.updated_at`,
        [
          profile.domain,
          profile.goal,
          JSON.stringify(profile.interests),
          profile.background,
          profile.updatedAt,
        ],
      );
      return profile;
    },
  };
}

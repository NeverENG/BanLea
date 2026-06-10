import { z } from "zod";

export const onboardingProfileSchema = z.object({
  domain: z.string(),
  goal: z.string().default(""),
  interests: z.array(z.string()).default([]),
  background: z.string().nullable().default(null),
  updatedAt: z.string(),
});

export const newOnboardingProfileSchema = onboardingProfileSchema;

export type OnboardingProfile = z.infer<typeof onboardingProfileSchema>;
export type NewOnboardingProfile = z.infer<typeof newOnboardingProfileSchema>;

export function parseOnboardingProfile(input: unknown) {
  return onboardingProfileSchema.safeParse(input);
}

import Database from "@tauri-apps/plugin-sql";
import { createEvidenceRepository } from "./evidenceRepo";
import { createOnboardingProfileRepository } from "./onboardingProfileRepo";
import { createPortraitRepository } from "./portraitRepo";
import { createRankerWeightRepository } from "./rankerWeightRepo";
import { createRecommendationRepository } from "./recommendationRepo";
import { createReadingListRepository } from "./readingListRepo";
import { createTutorSessionRepository } from "./tutorSessionRepo";

export * from "./evidenceRepo";
export * from "./onboardingProfileRepo";
export * from "./portraitRepo";
export * from "./rankerWeightRepo";
export * from "./recommendationRepo";
export * from "./readingListRepo";
export * from "./tutorSessionRepo";
export * from "./types";

/**
 * SQLite 仓储层入口（§11）。
 *
 * 库文件 banlea.db 由 tauri-plugin-sql 在应用启动时按迁移建好（见 src-tauri）。
 * 这里提供单例句柄；后续每张表一个 repo（如 evidenceRepo、portraitRepo）复用它。
 *
 * 注意：仅在 Tauri 运行时可用（依赖原生 sql 插件），不在纯 Node/vitest 环境运行。
 */

const DB_URL = "sqlite:banlea.db";

let dbPromise: Promise<Database> | null = null;

/** 获取数据库单例句柄（懒加载） */
export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL);
  }
  return dbPromise;
}

export async function getPortraitRepository() {
  return createPortraitRepository(await getDb());
}

export async function getEvidenceRepository() {
  return createEvidenceRepository(await getDb());
}

export async function getOnboardingProfileRepository() {
  return createOnboardingProfileRepository(await getDb());
}

export async function getReadingListRepository() {
  return createReadingListRepository(await getDb());
}

export async function getTutorSessionRepository() {
  return createTutorSessionRepository(await getDb());
}

export async function getRankerWeightRepository() {
  return createRankerWeightRepository(await getDb());
}

export async function getRecommendationRepository() {
  return createRecommendationRepository(await getDb());
}

import {
  getEvidenceRepository,
  getPortraitRepository,
  getReadingListRepository,
  getTutorSessionRepository,
} from "@/db";
import {
  loadDomainLearningSnapshot,
  type DomainLearningSnapshot,
} from "./index";

export async function loadRuntimeDomainLearningSnapshot(
  domain: string,
): Promise<DomainLearningSnapshot> {
  const [
    evidenceRepository,
    portraitRepository,
    readingListRepository,
    tutorSessionRepository,
  ] = await Promise.all([
    getEvidenceRepository(),
    getPortraitRepository(),
    getReadingListRepository(),
    getTutorSessionRepository(),
  ]);

  return loadDomainLearningSnapshot({
    domain,
    repositories: {
      evidence: evidenceRepository,
      portraits: portraitRepository,
      readingList: readingListRepository,
      tutorSessions: tutorSessionRepository,
    },
  });
}

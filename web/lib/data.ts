import apartmentsJson from "@/data/apartments.json";
import fakesJson from "@/data/fake_names.json";

export type Difficulty = "easy" | "mid" | "hard";

export interface Apartment {
  id: string;
  name: string;
  sido: string;
  sigungu: string;
  dong: string;
  builtYear: number;
  households: number;
  difficulty: Difficulty;
}

export interface FakeName {
  id: string;
  name: string;
  hint: string;
  difficulty: Difficulty;
}

export const apartments: Apartment[] = apartmentsJson.items as Apartment[];
export const fakeNames: FakeName[] = fakesJson.items as FakeName[];

import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface RuneSuggestion {
  primaryPathId: number;
  subPathId: number;
  selectedPerkIds: number[];
  reasoning: string;
}

export interface ItemSuggestion {
  itemName: string;
  reasoning: string;
}

export async function getRuneTweaks(myChampion: string, myTeam: string[], enemyTeam: string[]): Promise<RuneSuggestion & { winCondition: string }> {
  const prompt = `You are a Grandmaster LoL Specialist Coach for the 2026 Competitive Season.
  
  CONTEXT:
  - Subject: ${myChampion}
  - Allies: ${myTeam.join(", ")}
  - Enemies: ${enemyTeam.join(", ")}

  GOD-MODE ANALYSIS REQUIREMENT:
  1. IDENTIFY: Every enemy's primary source of power (e.g. Vayne's True Damage, Malphite's Armor scaling, LeBlanc's burst rotation).
  2. SYNERGY: How does ${myChampion} fit into or supplement the Ally comp (e.g. follow-up CC for Jarvan, peel for Jinx).
  3. THREAT: Which specific enemy passive or ability is the "game-ender" for you?
  
  TASK:
  Provide 2-3 hyper-situational rune tweaks (Stat Shards, specialized utility perks).
  - Mandatory MR Shards (5003) if enemy burst is unavoidable.
  - Mandatory Scorch (8237) or specialized pressure for specialist roles.
  
  Return JSON with: primaryPathId, subPathId, exactly 6 selectedPerkIds, reasoning (scannable in 3s), and winCondition (1 tactical victory sentence).`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          primaryPathId: { type: Type.INTEGER },
          subPathId: { type: Type.INTEGER },
          selectedPerkIds: { type: Type.ARRAY, items: { type: Type.INTEGER } },
          reasoning: { type: Type.STRING },
          winCondition: { type: Type.STRING },
        },
        required: ["primaryPathId", "subPathId", "selectedPerkIds", "reasoning", "winCondition"],
      },
    },
  });

  const text = response.text || "{}";
  return JSON.parse(text);
}

export async function getItemSuggestions(myChampion: string, myCurrentItems: string[], enemyChampions: string[], enemyItems: string[]): Promise<ItemSuggestion & { winCondition: string }> {
  const prompt = `You are a Grandmaster LoL Specialist Coach for the 2026 Competitive Season.
  
  CONTEXT:
  - Player: ${myChampion}
  - Current Items: ${myCurrentItems.join(", ")}
  - Enemies: ${enemyChampions.join(", ")}
  - Enemy Items: ${enemyItems.join(", ")}

  GOD-MODE ANALYSIS:
  - Analyze enemy build trends. Are they stacking Resistances early? Is their carry building lethality for a 1-shot?
  - Evaluate item interaction: Does the enemy have "Dusk and Dawn"? You need a counter-item.
  
  TASK:
  Suggest the single most effective next-item pivot. 
  PRIORITIZE 2026 Items: 
  - Dusk and Dawn (2510) for high-impact hybrid power.
  - Actualizer for mana-stacking scaling (ASol).
  
  Advice: 1 hyper-concise sentence.
  winCondition: 1 tactical win-con for the current state.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          itemName: { type: Type.STRING },
          reasoning: { type: Type.STRING },
          winCondition: { type: Type.STRING },
        },
        required: ["itemName", "reasoning", "winCondition"],
      },
    },
  });

  const text = response.text || "{}";
  return JSON.parse(text);
}

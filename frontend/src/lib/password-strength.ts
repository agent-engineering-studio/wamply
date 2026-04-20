export interface PasswordScore {
  score: 0 | 1 | 2 | 3 | 4;
  warning: string;
  suggestions: string[];
}

let ready: Promise<(password: string, userInputs?: string[]) => PasswordScore> | null = null;

async function getScorer(): Promise<(password: string, userInputs?: string[]) => PasswordScore> {
  const [core, common, it] = await Promise.all([
    import("@zxcvbn-ts/core"),
    import("@zxcvbn-ts/language-common"),
    import("@zxcvbn-ts/language-it"),
  ]);

  core.zxcvbnOptions.setOptions({
    translations: it.translations,
    graphs: common.adjacencyGraphs,
    dictionary: {
      ...common.dictionary,
      ...it.dictionary,
    },
  });

  return (password: string, userInputs: string[] = []) => {
    const result = core.zxcvbn(password, userInputs);
    return {
      score: result.score,
      warning: result.feedback.warning ?? "",
      suggestions: result.feedback.suggestions ?? [],
    };
  };
}

export async function scorePassword(
  password: string,
  userInputs: string[] = []
): Promise<PasswordScore> {
  if (!ready) ready = getScorer();
  const scorer = await ready;
  return scorer(password, userInputs);
}

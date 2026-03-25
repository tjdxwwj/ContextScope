export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-4': 8192,
  'gpt-4-turbo': 128000,
  'gpt-4-32k': 32768,
  'gpt-3.5-turbo': 16385,
  'gpt-3.5-turbo-16k': 16385,
  'claude-3-opus': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-haiku': 200000,
  'claude-2': 100000,
  'qwen': 32768,
  'qwen2': 128000,
  'default': 8192
};

export const STOP_WORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','must','shall','can','need','dare','ought','used','to','of','in','for','on','with','at','by','from','as','into','through','during','before','after','above','below','between','under','again','further','then','once','here','there','when','where','why','how','all','each','few','more','most','other','some','such','no','nor','not','only','own','same','so','than','too','very','just','and','but','if','or','because','until','while','although','though','after','before','when','whenever','where','wherever','whether','which','while','who','whoever','whom','whose','what','whatever','that','this','these','those','i','you','he','she','it','we','they','me','him','her','us','them','my','your','his','its','our','their','mine','yours','hers','ours','theirs','myself','yourself','himself','herself','itself','ourselves','themselves'
]);

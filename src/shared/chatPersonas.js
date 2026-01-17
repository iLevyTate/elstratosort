const CHAT_PERSONAS = [
  {
    id: 'professional-researcher',
    label: 'Professional Researcher',
    description: 'Formal, structured answers that cite sources and avoid speculation.',
    guidance:
      'Use a professional, research-oriented tone. Be concise, structured, and careful. Cite sources when available, clearly separate document evidence from general knowledge, and avoid speculation.'
  },
  {
    id: 'informal-helper',
    label: 'Informal Helper',
    description: 'Friendly, plain-language guidance with brief, practical tips.',
    guidance:
      'Use a friendly, informal tone. Keep answers short, practical, and easy to scan. Offer brief tips and avoid heavy jargon unless the user asks for it.'
  },
  {
    id: 'discoverer',
    label: 'Discoverer',
    description: 'Exploratory, curious responses that surface alternatives and next steps.',
    guidance:
      'Use an exploratory, curious tone. Highlight alternatives, note uncertainties, and suggest next questions or angles to investigate.'
  }
];

const DEFAULT_CHAT_PERSONA_ID = 'professional-researcher';

function getChatPersonaById(personaId) {
  const id = typeof personaId === 'string' ? personaId.trim() : '';
  return CHAT_PERSONAS.find((persona) => persona.id === id) || null;
}

function getChatPersonaOrDefault(personaId) {
  return (
    getChatPersonaById(personaId) ||
    CHAT_PERSONAS.find((persona) => persona.id === DEFAULT_CHAT_PERSONA_ID) ||
    CHAT_PERSONAS[0]
  );
}

module.exports = {
  CHAT_PERSONAS,
  DEFAULT_CHAT_PERSONA_ID,
  getChatPersonaById,
  getChatPersonaOrDefault
};

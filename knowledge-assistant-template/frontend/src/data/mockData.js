// Demo-mode fixtures. Remove once the real API in src/api/client.js is wired up.

export const mockConversations = [
  { id: "c1", title: "Q3 vendor contract terms" },
  { id: "c2", title: "Onboarding policy exceptions" },
  { id: "c3", title: "Data retention requirements" },
];

export const mockPrompts = [
  "What are the termination clauses in our current vendor contracts?",
  "Summarize the latest change to our data retention policy.",
  "Which policies mention a 30-day exception window?",
];

// A canned assistant answer with inline [n] citation markers that map to
// entries in `sources` by index (1-based). This is what the real API
// response should look like — see src/api/client.js.
export const mockAnswer = {
  role: "assistant",
  text:
    "Vendor contracts signed after January 2025 include a 45-day termination-for-convenience clause[1], " +
    "shortened from the previous 90-day standard[2]. Any exception requires written sign-off from " +
    "Procurement and Legal before the contract is countersigned[1][3].",
  confidence: 0.86,
  sources: [
    {
      id: "s1",
      title: "Master Services Agreement Template v4.2",
      location: "Section 12.3 · p. 8",
      excerpt:
        "Either party may terminate for convenience with 45 days' written notice, effective for all agreements executed on or after January 1, 2025.",
    },
    {
      id: "s2",
      title: "Procurement Policy Handbook",
      location: "Section 4.1 · p. 21",
      excerpt:
        "Prior to the 2025 revision, standard vendor agreements carried a 90-day termination-for-convenience window.",
    },
    {
      id: "s3",
      title: "Legal Review Checklist",
      location: "Item 9",
      excerpt:
        "Exceptions to standard terms require documented approval from both Procurement and Legal prior to countersignature.",
    },
  ],
};

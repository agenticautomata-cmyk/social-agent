export type CreatorContactChannel = {
  id: string;
  label: string;
  email: string;
  purpose: string;
  connections: string[];
  href: string | null;
};

export type CreatorInboxConfig = {
  sendAsGmail: string | null;
  displayName: string;
  domain: string;
  channels: CreatorContactChannel[];
};

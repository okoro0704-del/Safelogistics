import type {
  DnsProvider,
  DnsRecord,
  DnsRecordInput,
} from "@/lib/domains/providers/dns/types";

/**
 * In-memory DNS provider for local development / tests.
 * Must never be selected in production.
 */
export class MockDnsProvider implements DnsProvider {
  readonly id = "mock";
  private records = new Map<string, DnsRecord>();

  async ensureRecord(input: DnsRecordInput): Promise<DnsRecord> {
    const key = `${input.type}:${input.name.toLowerCase()}`;
    const existing = [...this.records.values()].find(
      (r) =>
        r.type === input.type &&
        r.name.toLowerCase() === input.name.toLowerCase() &&
        r.content === input.content,
    );
    if (existing) return existing;

    // Update content if same name+type exists
    const sameName = [...this.records.values()].find(
      (r) =>
        r.type === input.type &&
        r.name.toLowerCase() === input.name.toLowerCase(),
    );
    if (sameName) {
      const updated: DnsRecord = {
        ...sameName,
        content: input.content,
        ttl: input.ttl,
        proxied: input.proxied,
      };
      this.records.set(sameName.id, updated);
      return updated;
    }

    const record: DnsRecord = {
      id: `mock_${key}_${Date.now()}`,
      type: input.type,
      name: input.name,
      content: input.content,
      ttl: input.ttl ?? 300,
      proxied: input.proxied,
    };
    this.records.set(record.id, record);
    return record;
  }

  async deleteRecord(recordId: string): Promise<void> {
    this.records.delete(recordId);
  }

  async findRecords(filter: {
    type?: DnsRecordInput["type"];
    name: string;
  }): Promise<DnsRecord[]> {
    return [...this.records.values()].filter((r) => {
      if (filter.type && r.type !== filter.type) return false;
      return r.name.toLowerCase() === filter.name.toLowerCase();
    });
  }
}

/** Process-wide mock store so provision + verify share state in dev. */
let sharedMock: MockDnsProvider | null = null;

export function getSharedMockDnsProvider() {
  if (!sharedMock) sharedMock = new MockDnsProvider();
  return sharedMock;
}

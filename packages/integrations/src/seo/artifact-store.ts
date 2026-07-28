export interface RawArtifact {
  readonly objectKey: string;
  readonly bytes: number;
}

export interface RawArtifactStore {
  putJson(input: {
    readonly tenantId: string;
    readonly category: string;
    readonly artifactId: string;
    readonly value: unknown;
  }): Promise<RawArtifact>;
  putText(input: {
    readonly tenantId: string;
    readonly category: string;
    readonly artifactId: string;
    readonly value: string;
    readonly bucket: "reports";
    readonly contentType: "text/html";
  }): Promise<RawArtifact>;
  putPdf(input: {
    readonly tenantId: string;
    readonly category: string;
    readonly artifactId: string;
    readonly value: Uint8Array;
    readonly bucket: "reports";
    readonly contentType: "application/pdf";
  }): Promise<RawArtifact>;
}

export class SupabaseRawArtifactStore implements RawArtifactStore {
  public constructor(
    private readonly options: {
      readonly supabaseUrl: string;
      readonly secretKey: string;
      readonly fetchImpl?: typeof fetch;
    }
  ) {}

  public async putJson(input: {
    readonly tenantId: string;
    readonly category: string;
    readonly artifactId: string;
    readonly value: unknown;
  }): Promise<RawArtifact> {
    const objectKey = `${input.tenantId}/${input.category}/${input.artifactId}.json`;
    const body = JSON.stringify(input.value);
    return this.put({ bucket: "raw", contentType: "application/json", objectKey, body });
  }

  public putText(input: {
    readonly tenantId: string;
    readonly category: string;
    readonly artifactId: string;
    readonly value: string;
    readonly bucket: "reports";
    readonly contentType: "text/html";
  }): Promise<RawArtifact> {
    const objectKey = `${input.tenantId}/${input.category}/${input.artifactId}.html`;
    return this.put({
      bucket: input.bucket,
      contentType: input.contentType,
      objectKey,
      body: input.value
    });
  }

  public putPdf(input: {
    readonly tenantId: string;
    readonly category: string;
    readonly artifactId: string;
    readonly value: Uint8Array;
    readonly bucket: "reports";
    readonly contentType: "application/pdf";
  }): Promise<RawArtifact> {
    const objectKey = `${input.tenantId}/${input.category}/${input.artifactId}.pdf`;
    return this.put({
      bucket: input.bucket,
      contentType: input.contentType,
      objectKey,
      body: Uint8Array.from(input.value).buffer
    });
  }

  private async put(input: {
    readonly bucket: "raw" | "reports";
    readonly contentType: "application/json" | "text/html" | "application/pdf";
    readonly objectKey: string;
    readonly body: string | ArrayBuffer;
  }): Promise<RawArtifact> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const response = await fetchImpl(
      `${this.options.supabaseUrl.replace(/\/$/u, "")}/storage/v1/object/${input.bucket}/${input.objectKey}`,
      {
        method: "POST",
        headers: {
          apikey: this.options.secretKey,
          Authorization: `Bearer ${this.options.secretKey}`,
          "Content-Type": input.contentType,
          "x-upsert": "false"
        },
        body: input.body
      }
    );
    if (!response.ok && response.status !== 409) {
      throw new Error(`Raw artifact upload failed with status ${String(response.status)}`);
    }
    return {
      objectKey: input.objectKey,
      bytes:
        typeof input.body === "string"
          ? new TextEncoder().encode(input.body).byteLength
          : input.body.byteLength
    };
  }
}

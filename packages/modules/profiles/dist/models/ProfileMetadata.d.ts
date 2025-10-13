import { SmrtObject, SmrtObjectOptions } from '../../../../core/smrt/src';
export interface ProfileMetadataOptions extends SmrtObjectOptions {
    profileId?: string;
    metafieldId?: string;
    value?: string;
}
export declare class ProfileMetadata extends SmrtObject {
    profileId: import('../../../../core/smrt/src').Field;
    metafieldId: import('../../../../core/smrt/src').Field;
    value: import('../../../../core/smrt/src').Field;
    constructor(options?: ProfileMetadataOptions);
    /**
     * Validate this metadata value against the metafield's validation schema
     *
     * @returns True if valid, throws error if invalid
     */
    validate(): Promise<boolean>;
    /**
     * Get the metafield slug for this metadata
     *
     * @returns The slug of the metafield
     */
    getMetafieldSlug(): Promise<string>;
}
//# sourceMappingURL=ProfileMetadata.d.ts.map
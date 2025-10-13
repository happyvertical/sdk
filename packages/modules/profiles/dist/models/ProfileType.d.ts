import { SmrtObject, SmrtObjectOptions } from '../../../../core/smrt/src';
export interface ProfileTypeOptions extends SmrtObjectOptions {
    slug?: string;
    name?: string;
    description?: string;
}
export declare class ProfileType extends SmrtObject {
    name: import('../../../../core/smrt/src').Field;
    description: import('../../../../core/smrt/src').Field;
    constructor(options?: ProfileTypeOptions);
    /**
     * Convenience method for slug-based lookup
     *
     * @param slug - The slug to search for
     * @returns ProfileType instance or null if not found
     */
    static getBySlug(slug: string): Promise<ProfileType | null>;
}
//# sourceMappingURL=ProfileType.d.ts.map
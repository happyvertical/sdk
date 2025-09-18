/**
 * Module Federation Configuration
 *
 * Defines what this SMRT microservice exposes and consumes via module federation.
 * This enables runtime sharing of components between microservices.
 */
export declare const federationConfig: {
    name: string;
    filename: string;
    exposes: {
        [x: string]: string;
    };
    remotes: Record<string, string>;
    shared: Record<string, import("./src/federation/shared.config.js").SharedDependency>;
};
export default federationConfig;
//# sourceMappingURL=federation.config.d.ts.map
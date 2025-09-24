import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
// import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';
import Layout from '@theme/Layout';
import styles from './index.module.css';
function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className="hero hero--primary">
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link className="button button--secondary button--lg" to="/docs">
            Get Started in 5 Minutes ⏱️
          </Link>
        </div>
      </div>
    </header>
  );
}
export default function Home() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title} - Build Powerful AI Agents`}
      description="Build powerful, vertical AI agents in TypeScript with the SMRT framework. Structure + Memory + Perception = Intelligence."
    >
      <HomepageHeader />
      <main>
        <div className="container">
          <div className="row">
            <div className="col col--8 col--offset-2">
              <h2>Structure + Memory + Perception = Intelligence</h2>
              <p>
                The SMRT framework provides everything you need to build
                powerful AI agents in TypeScript. Create intelligent, persistent
                agents that can understand, remember, and act in complex
                environments.
              </p>
            </div>
          </div>
        </div>
      </main>
    </Layout>
  );
}
//# sourceMappingURL=index.js.map

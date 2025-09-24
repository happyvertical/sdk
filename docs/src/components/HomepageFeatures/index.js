import Heading from '@theme/Heading';
import clsx from 'clsx';
import styles from './styles.module.css';

const FeatureList = [
  {
    title: 'Structure with SmartObjects',
    icon: '🏗️',
    description: (
      <>
        Define your agent's world with SmartObjects. Automatic database schemas,
        AI-powered methods, and type-safe operations make modeling your domain
        effortless.
      </>
    ),
  },
  {
    title: 'Memory with Collections',
    icon: '🧠',
    description: (
      <>
        Give your agents persistent memory. Collections provide intelligent
        querying, batch operations, and semantic search across your agent's
        knowledge base.
      </>
    ),
  },
  {
    title: 'Perception with Tools',
    icon: '👁️',
    description: (
      <>
        Connect agents to the world with Tools. File system access, web
        scraping, PDF processing, and custom integrations through a unified
        interface.
      </>
    ),
  },
];
function Feature({ title, icon, description }) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <div
          className={styles.featureSvg}
          role="img"
          style={{ fontSize: '4rem' }}
        >
          {icon}
        </div>
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}
export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
//# sourceMappingURL=index.js.map

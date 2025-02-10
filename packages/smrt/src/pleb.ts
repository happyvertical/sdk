import { BaseObject } from './object';
import type { BaseObjectOptions } from './object';

export interface PlebOptions extends BaseObjectOptions {}

export class Pleb<T extends PlebOptions = PlebOptions> extends BaseObject<T> {
  constructor(options: T) {
    super(options);
    this._className = this.constructor.name;
  }

  static async create(options: PlebOptions) {
    const pleb = new Pleb(options);
    await pleb.initialize();
    return pleb;
  }

  protected async initialize(): Promise<void> {
    await super.initialize();
    // const db = await getDatabase();
    // const schema = await syncSchema(options.schema);
  }

  // protected async getThread(options: {
  //   prompt: string;
  //   references: Content[];
  //   ai: GetAIClientOptions;
  // }) {
  //   const ai = options.ai
  //     ? await getAIClient(options.ai)
  //     : await getAIClient(this.options.ai);

  //   const thread = await AIThread.create({
  //     ai,
  //   });

  //   thread.addMessage({
  //     role: 'system',
  //     content: options.prompt,
  //   });

  //   for (const reference of options.references) {
  //     thread.addMessage({
  //       role: 'system',
  //       content: JSON.stringify(reference),
  //     });
  //   }

  //   const contentPrompt = `
  //     You are a writer for a local newspaper.
  //     You are given a bit of content from the internet and you are asked to write a short article about it.
  //     The article should be 100 words or less.
  //   `;
  //   const body = await thread.addMessage(contentPrompt);

  //   console.log(body);
  // }
}

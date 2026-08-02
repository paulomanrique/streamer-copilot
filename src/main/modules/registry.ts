export interface MainFeatureModule {
  readonly id: string;
  initialize(): Promise<void>;
  switchProfile(profileDirectory: string): Promise<void>;
  dispose(): Promise<void>;
}

/** Lifecycle registry for new main-process feature modules. Existing services
 * can migrate incrementally; new modules no longer add teardown/profile-switch
 * branches throughout app-context. */
export class MainFeatureRegistry {
  private readonly modules = new Map<string, MainFeatureModule>();

  register(module: MainFeatureModule): void {
    if (this.modules.has(module.id)) throw new Error(`Main feature already registered: ${module.id}`);
    this.modules.set(module.id, module);
  }

  async initializeAll(): Promise<void> {
    for (const module of this.modules.values()) await module.initialize();
  }

  async switchProfileAll(profileDirectory: string): Promise<void> {
    for (const module of this.modules.values()) await module.switchProfile(profileDirectory);
  }

  async disposeAll(): Promise<void> {
    const modules = [...this.modules.values()].reverse();
    await Promise.allSettled(modules.map((module) => module.dispose()));
  }
}

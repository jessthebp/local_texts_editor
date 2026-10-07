"use strict";

/* -------------------------------------------------------------------------- */
/* UTILITIES                                                                   */
/* -------------------------------------------------------------------------- */

const Utils = {
  uid(prefix = "id") {
    return `${prefix}-${crypto.randomUUID()}`;
  },

  clone(value) {
    return JSON.parse(JSON.stringify(value));
  },

  escapeHtml(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  },

  hexToRgb(hex) {
    const normalized = String(hex).replace("#", "").trim();

    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
      return { r: 128, g: 128, b: 128 };
    }

    return {
      r: parseInt(normalized.slice(0, 2), 16),
      g: parseInt(normalized.slice(2, 4), 16),
      b: parseInt(normalized.slice(4, 6), 16),
    };
  },

  contrastTextColor(hex) {
    const { r, g, b } = this.hexToRgb(hex);
    const luminance = (r * 299 + g * 587 + b * 114) / 1000;

    return luminance > 155 ? "#171923" : "#ffffff";
  },

  safeArray(value) {
    return Array.isArray(value) ? value : [];
  },
};

const ProjectMigrations = {
  latestVersion: 5,

  migrate(project) {
    let migrated = Utils.clone(project || {});
    let version = Number(migrated.version || 1);

    if (!Number.isFinite(version) || version < 1) {
      version = 1;
    }

    if (version > this.latestVersion) {
      throw new Error(
        `Project version ${version} is newer than this editor supports (${this.latestVersion}).`
      );
    }

    while (version < this.latestVersion) {
      const migration = this[`migrateV${version}ToV${version + 1}`];

      if (!migration) {
        throw new Error(`No migration exists from project version ${version}.`);
      }

      migrated = migration.call(this, migrated);
      version += 1;
      migrated.version = version;
    }

    return migrated;
  },

  migrateV1ToV2(project) {
    return {
      ...project,
      characters: Utils.safeArray(project.characters),
      modules: Utils.safeArray(project.modules),
    };
  },

  migrateV2ToV3(project) {
    return {
      ...project,
      socialProfiles: Utils.safeArray(project.socialProfiles),
      newspaperProfiles: Utils.safeArray(project.newspaperProfiles),
    };
  },

  migrateV3ToV4(project) {
    return {
      ...project,
      settings: {
        ...(project.settings || {}),
        overlays: {
          scanlines: false,
          vignette: false,
          grain: false,
          crtFlicker: false,
          paperTexture: false,
          reducedMotion: false,
          ...(project.settings?.overlays || {}),
        },
        readerEffects: {
          redactionReveal: true,
          imageGlitchOnHover: false,
          evidenceFocusBlur: true,
          ...(project.settings?.readerEffects || {}),
        },
      },
      modules: Utils.safeArray(project.modules).map((module) => ({
        ...module,
        ui: { collapsed: false, ...(module?.ui || {}) },
      })),
    };
  },

  migrateV4ToV5(project) {
    return {
      ...project,
      modules: Utils.safeArray(project.modules).map((module) => ({
        ...module,
        meta: ProjectSchema.createDefaultModuleMeta(module?.meta),
      })),
    };
  },
};

const ProjectSchema = {
  CURRENT_VERSION: 5,

  createDefaultModuleMeta(meta = {}) {
    return {
      timelineDate: "",
      displayDate: "",
      location: "",
      sourceCharacterId: "",
      reliability: "direct",
      tags: [],
      evidenceId: "",
      unlockState: "visible",
      draft: false,
      authorNote: "",
      ...(meta || {}),
      tags: Utils.safeArray(meta?.tags),
    };
  },

  createEmptyProject() {
    const now = new Date().toISOString();

    return {
      version: this.CURRENT_VERSION,

      title: "Untitled ARG Story",

    settings: {
          pageBackground: "#0c0d13",
          canvasBackground: "#0c0d13",
          canvasWidth: "standard",
          backgroundShape: "none",
          readerTextSize: "normal",
          readerLineSpacing: "normal",
          fontFamily: "system",

          overlays: {
            scanlines: false,
            vignette: false,
            grain: false,
            crtFlicker: false,
            paperTexture: false,
            reducedMotion: false
          },

          readerEffects: {
            redactionReveal: true,
            imageGlitchOnHover: false,
            evidenceFocusBlur: true
          },

          footerText: "Continue to Next Chapter →",
          footerUrl: "#"
        },

      meta: {
        createdAt: now,
        updatedAt: now,
      },

      characters: [],
      socialProfiles: [],
      newspaperProfiles: [],
      modules: [],
    };
  },

  normalize(project) {
    const base = this.createEmptyProject();
    const incoming = ProjectMigrations.migrate(project);

    return {
      ...base,
      ...incoming,

      version: this.CURRENT_VERSION,

     settings: {
            ...base.settings,
            ...(incoming.settings || {}),

            overlays: {
              scanlines: false,
              vignette: false,
              grain: false,
              crtFlicker: false,
              paperTexture: false,
              reducedMotion: false,

              ...(incoming.settings?.overlays || {}),
            },

            readerEffects: {
              redactionReveal: true,
              imageGlitchOnHover: false,
              evidenceFocusBlur: true,

              ...(incoming.settings?.readerEffects || {}),
            },
          },

      meta: {
        ...base.meta,
        ...(incoming.meta || {}),
        updatedAt: new Date().toISOString(),
      },

      characters: Utils.safeArray(incoming.characters),
      socialProfiles: Utils.safeArray(incoming.socialProfiles),
      newspaperProfiles: Utils.safeArray(incoming.newspaperProfiles),
      modules: Utils.safeArray(incoming.modules).map((module) => ({
        ...module,
        ui: {
          ...(module?.ui || {}),
          collapsed: module?.ui?.collapsed === true,
        },
        meta: this.createDefaultModuleMeta(module?.meta),
        data: {
          ...(module?.data || {}),
        },
      })),
    };
  },
};


class ProjectValidator {
  static validate(project, registry) {
    const errors = [];
    const warnings = [];

    if (!project || typeof project !== "object" || Array.isArray(project)) {
      return {
        valid: false,
        errors: ["Project data must be a JSON object."],
        warnings: [],
      };
    }

    if (typeof project.version === "number") {
      if (project.version > ProjectMigrations.latestVersion) {
        return {
          valid: false,
          errors: [
            `Project version ${project.version} is newer than this editor supports (${ProjectMigrations.latestVersion}).`,
          ],
          warnings: [],
        };
      }
      if (project.version < ProjectMigrations.latestVersion) {
        warnings.push(
          `Project version ${project.version} will be migrated to version ${ProjectMigrations.latestVersion}.`
        );
      }
    }


    if (!Array.isArray(project.modules)) {
      errors.push('Project must contain a "modules" array.');
    }

    if (
      project.characters !== undefined &&
      !Array.isArray(project.characters)
    ) {
      errors.push('"characters" must be an array when supplied.');
    }

    if (
      project.socialProfiles !== undefined &&
      !Array.isArray(project.socialProfiles)
    ) {
      errors.push('"socialProfiles" must be an array when supplied.');
    }

    if (
      project.newspaperProfiles !== undefined &&
      !Array.isArray(project.newspaperProfiles)
    ) {
      errors.push('"newspaperProfiles" must be an array when supplied.');
    }

    const characterIds = new Set(
      Utils.safeArray(project.characters).map((character) => character.id)
    );

    const socialProfileIds = new Set(
      Utils.safeArray(project.socialProfiles).map((profile) => profile.id)
    );

    const newspaperProfileIds = new Set(
      Utils.safeArray(project.newspaperProfiles).map((profile) => profile.id)
    );

    const moduleIds = new Set();

    Utils.safeArray(project.modules).forEach((module, index) => {
      const label = `Module ${index + 1}`;

      if (!module?.id) {
        errors.push(`${label} is missing an id.`);
      }

      if (module?.id && moduleIds.has(module.id)) {
        errors.push(`${label} has a duplicate id: "${module.id}".`);
      }

      if (module?.id) {
        moduleIds.add(module.id);
      }

      if (!module?.type) {
        errors.push(`${label} is missing a type.`);
      } else if (!registry.has(module.type)) {
        warnings.push(
          `${label} uses unsupported type "${module.type}". It will render as an unsupported module until registered.`
        );
      }

      if (!module?.data || typeof module.data !== "object") {
        errors.push(`${label} is missing its data object.`);
      }

      if (
        module?.type === "phone-thread" &&
        module.data?.ownerCharacterId &&
        !characterIds.has(module.data.ownerCharacterId)
      ) {
        warnings.push(
          `${label} references a missing phone owner "${module.data.ownerCharacterId}".`
        );
      }

      if (module?.type === "social-media-post") {
        const profileId = module.data?.profileId;

        if (profileId && !socialProfileIds.has(profileId)) {
          warnings.push(
            `${label} references a missing social profile "${profileId}".`
          );
        }
      }

      if (module?.type === "newspaper-article") {
        const publicationId = module.data?.publicationId;

        if (publicationId && !newspaperProfileIds.has(publicationId)) {
          warnings.push(
            `${label} references a missing newspaper profile "${publicationId}".`
          );
        }
      }
    });

    Utils.safeArray(project.socialProfiles).forEach((profile, index) => {
      if (
        profile.ownerCharacterId &&
        !characterIds.has(profile.ownerCharacterId)
      ) {
        warnings.push(
          `Social profile ${index + 1} references missing character "${profile.ownerCharacterId}".`
        );
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  static format(result) {
    const lines = [];

    if (result.errors.length) {
      lines.push("ERRORS:");
      result.errors.forEach((error) => lines.push(`• ${error}`));
    }

    if (result.warnings.length) {
      if (lines.length) {
        lines.push("");
      }

      lines.push("WARNINGS:");
      result.warnings.forEach((warning) => lines.push(`• ${warning}`));
    }

    return lines.length
      ? lines.join("\n")
      : "Project validation passed with no errors or warnings.";
  }
};

class ReferenceChecker {
  static getMissingReferences(project) {
    const issues = [];
    const characterIds = new Set(
      Utils.safeArray(project.characters).map((character) => character.id)
    );
    const socialProfileIds = new Set(
      Utils.safeArray(project.socialProfiles).map((profile) => profile.id)
    );
    const newspaperProfileIds = new Set(
      Utils.safeArray(project.newspaperProfiles).map((profile) => profile.id)
    );

    Utils.safeArray(project.modules).forEach((module) => {
      const data = module.data || {};
      const checkCharacter = (characterId, fieldName) => {
        if (characterId && !characterIds.has(characterId)) {
          issues.push({
            severity: "warning",
            kind: "missing-character",
            moduleId: module.id,
            moduleType: module.type,
            fieldName,
            referenceId: characterId,
            message: `Missing character "${characterId}" referenced by ${fieldName}.`,
          });
        }
      };

      if (module.type === "phone-thread") {
        checkCharacter(data.ownerCharacterId, "Phone owner");
        Utils.safeArray(data.messages).forEach((message, index) => {
          checkCharacter(
            message.senderCharacterId,
            `Message ${index + 1} sender`
          );
        });
      }

      if (module.type === "forum-post") {
        checkCharacter(data.authorCharacterId, "Original post author");
        Utils.safeArray(data.replies).forEach((reply, index) => {
          checkCharacter(
            reply.authorCharacterId,
            `Reply ${index + 1} author`
          );
        });
      }

      if (module.type === "voice-message") {
        checkCharacter(data.phoneOwnerCharacterId, "Voicemail phone owner");
        checkCharacter(data.callerCharacterId, "Voicemail caller");
      }

      if (module.type === "transcript") {
        checkCharacter(data.sourceCharacterId, "Transcript source");
        Utils.safeArray(data.speakers).forEach((speaker, index) => {
          checkCharacter(
            speaker.characterId,
            `Transcript speaker ${index + 1}`
          );
        });
      }

      if (
        module.type === "social-media-post" &&
        data.profileId &&
        !socialProfileIds.has(data.profileId)
      ) {
        issues.push({
          severity: "warning",
          kind: "missing-social-profile",
          moduleId: module.id,
          moduleType: module.type,
          fieldName: "Social profile",
          referenceId: data.profileId,
          message: `Missing social profile "${data.profileId}".`,
        });
      }

      if (
        module.type === "newspaper-article" &&
        data.publicationId &&
        !newspaperProfileIds.has(data.publicationId)
      ) {
        issues.push({
          severity: "warning",
          kind: "missing-newspaper-profile",
          moduleId: module.id,
          moduleType: module.type,
          fieldName: "Newspaper publication",
          referenceId: data.publicationId,
          message: `Missing newspaper profile "${data.publicationId}".`,
        });
      }
    });

    return issues;
  }

  static getModuleIssues(project, moduleId) {
    return this.getMissingReferences(project).filter(
      (issue) => issue.moduleId === moduleId
    );
  }
}


/* -------------------------------------------------------------------------- */
/* PROJECT STORE                                                               */
/* -------------------------------------------------------------------------- */
class ProjectStore {
  constructor(initialProject) {
    this.state = ProjectSchema.normalize(initialProject);

    this.listeners = new Set();

    this.history = [];
    this.future = [];

    this.maxHistory = 60;
    this.isApplyingHistory = false;

    this.saveHistorySnapshot();
  }

  getState() {
    return this.state;
  }

  subscribe(listener) {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(recordHistory = false) {
    this.state.meta = {
      ...(this.state.meta || {}),
      updatedAt: new Date().toISOString(),
    };

    if (recordHistory) {
      this.saveHistorySnapshot();
    }

    this.listeners.forEach((listener) => listener(this.state));
  }

  createSnapshot() {
    return JSON.stringify({
      ...this.state,
      meta: {
        ...(this.state.meta || {}),
        updatedAt: "",
      },
    });
  }

  saveHistorySnapshot() {
    const snapshot = this.createSnapshot();
    const latestSnapshot = this.history[this.history.length - 1];

    if (snapshot === latestSnapshot) {
      return;
    }

    this.history.push(snapshot);

    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  beginMutation() {
    if (this.isApplyingHistory) {
      return;
    }

    this.saveHistorySnapshot();
    this.future = [];
  }

  finalizeMutation() {
    if (this.isApplyingHistory) {
      return;
    }

    this.emit(true);
  }

  canUndo() {
    return this.history.length > 1;
  }

  canRedo() {
    return this.future.length > 0;
  }

  undo() {
    if (!this.canUndo()) {
      return false;
    }

    this.isApplyingHistory = true;

    const currentSnapshot = this.history.pop();

    if (currentSnapshot) {
      this.future.push(currentSnapshot);
    }

    const previousSnapshot = this.history[this.history.length - 1];

    if (previousSnapshot) {
      this.state = ProjectSchema.normalize(JSON.parse(previousSnapshot));
    }

    this.isApplyingHistory = false;
    this.emit();

    return true;
  }

  redo() {
    if (!this.canRedo()) {
      return false;
    }

    this.isApplyingHistory = true;

    const nextSnapshot = this.future.pop();

    if (nextSnapshot) {
      this.history.push(nextSnapshot);
      this.state = ProjectSchema.normalize(JSON.parse(nextSnapshot));
    }

    this.isApplyingHistory = false;
    this.emit();

    return true;
  }

  replaceProject(project, options = {}) {
    if (options.recordHistory === false) {
      this.state = ProjectSchema.normalize(project);
      this.history = [];
      this.future = [];
      this.emit();
      this.saveHistorySnapshot();
      return;
    }

    this.beginMutation();
    this.state = ProjectSchema.normalize(project);
    this.finalizeMutation();
  }

  updateProject(updates) {
    this.beginMutation();
    Object.assign(this.state, updates);
    this.finalizeMutation();
  }

  updateSettings(updates) {
    this.beginMutation();

    this.state.settings = {
      ...(this.state.settings || {}),
      ...updates,
    };

    this.finalizeMutation();
  }

  getCharacter(characterId) {
    return this.state.characters.find(
      (character) => character.id === characterId
    );
  }

  getCharacterOrFallback(characterId) {
    return (
      this.getCharacter(characterId) || {
        id: "unknown-character",
        name: "Unknown",
        shortName: "?",
        avatar: "?",
        primaryColor: "#7a7f8c",
        softColor: "#e4e6eb",
      }
    );
  }

  addCharacter(character) {
    this.beginMutation();
    this.state.characters.push(character);
    this.finalizeMutation();
  }

  updateCharacter(characterId, updates) {
    const character = this.getCharacter(characterId);

    if (!character) {
      return;
    }

    this.beginMutation();
    Object.assign(character, updates);
    this.finalizeMutation();
  }

  deleteCharacter(characterId) {
    const isInUse = this.state.modules.some((module) => {
      if (module.type === "phone-thread") {
        const isOwner = module.data.ownerCharacterId === characterId;

        const appearsInMessages = Utils.safeArray(module.data.messages).some(
          (message) => message.senderCharacterId === characterId
        );

        return isOwner || appearsInMessages;
      }

      if (module.type === "forum-post") {
        const isOriginalAuthor =
          module.data.authorCharacterId === characterId;

        const appearsInReplies = Utils.safeArray(module.data.replies).some(
          (reply) => reply.authorCharacterId === characterId
        );

        return isOriginalAuthor || appearsInReplies;
      }

      if (module.type === "voicemail") {
        return module.data.callerCharacterId === characterId;
      }

      return false;
    });

    const ownsSocialProfile = Utils.safeArray(this.state.socialProfiles).some(
      (profile) => profile.ownerCharacterId === characterId
    );

    if (isInUse || ownsSocialProfile) {
      notifyUser(
        "This character is still used by one or more modules or social profiles. Reassign those references before deleting the character."
      );
      return false;
    }

    this.beginMutation();

    this.state.characters = this.state.characters.filter(
      (character) => character.id !== characterId
    );

    this.finalizeMutation();
    return true;
  }

  getSocialProfile(profileId) {
    return Utils.safeArray(this.state.socialProfiles).find(
      (profile) => profile.id === profileId
    );
  }

  addSocialProfile(profile) {
    this.beginMutation();

    if (!Array.isArray(this.state.socialProfiles)) {
      this.state.socialProfiles = [];
    }

    this.state.socialProfiles.push(profile);
    this.finalizeMutation();
  }

  updateSocialProfile(profileId, updates) {
    const profile = this.getSocialProfile(profileId);

    if (!profile) {
      return;
    }

    this.beginMutation();
    Object.assign(profile, updates);
    this.finalizeMutation();
  }

  deleteSocialProfile(profileId) {
    const isInUse = this.state.modules.some(
      (module) =>
        module.type === "social-media-post" &&
        module.data.profileId === profileId
    );

    if (isInUse) {
      notifyUser(
        "This social profile is used by at least one social media module. Reassign those posts before deleting the profile."
      );
      return false;
    }

    this.beginMutation();

    this.state.socialProfiles = Utils.safeArray(
      this.state.socialProfiles
    ).filter((profile) => profile.id !== profileId);

    this.finalizeMutation();
    return true;
  }

  getNewspaperProfile(profileId) {
    return Utils.safeArray(this.state.newspaperProfiles).find(
      (profile) => profile.id === profileId
    );
  }

  addNewspaperProfile(profile) {
    this.beginMutation();

    if (!Array.isArray(this.state.newspaperProfiles)) {
      this.state.newspaperProfiles = [];
    }

    this.state.newspaperProfiles.push(profile);
    this.finalizeMutation();
  }

  updateNewspaperProfile(profileId, updates) {
    const profile = this.getNewspaperProfile(profileId);

    if (!profile) {
      return;
    }

    this.beginMutation();
    Object.assign(profile, updates);
    this.finalizeMutation();
  }

  deleteNewspaperProfile(profileId) {
    const isInUse = this.state.modules.some(
      (module) =>
        module.type === "newspaper-article" &&
        module.data.publicationId === profileId
    );

    if (isInUse) {
      notifyUser(
        "This publication is used by one or more newspaper modules. Reassign those articles before deleting it."
      );
      return false;
    }

    this.beginMutation();

    this.state.newspaperProfiles = Utils.safeArray(
      this.state.newspaperProfiles
    ).filter((profile) => profile.id !== profileId);

    this.finalizeMutation();
    return true;
  }

  getModule(moduleId) {
    return this.state.modules.find((module) => module.id === moduleId);
  }

  addModule(module) {
    this.beginMutation();
    this.state.modules.push(module);
    this.finalizeMutation();
  }

  updateModule(moduleId, updates) {
    const module = this.getModule(moduleId);

    if (!module) {
      return;
    }

    this.beginMutation();
    Object.assign(module, updates);
    this.finalizeMutation();
  }

  updateModuleData(moduleId, updates) {
    const module = this.getModule(moduleId);

    if (!module) {
      return;
    }

    this.beginMutation();

    module.data = {
      ...(module.data || {}),
      ...updates,
    };

    this.finalizeMutation();
  }

  updateModuleUi(moduleId, updates) {
    const module = this.getModule(moduleId);

    if (!module) {
      return;
    }

    this.beginMutation();
    module.ui = {
      collapsed: false,
      ...(module.ui || {}),
      ...updates,
    };
    this.finalizeMutation();
  }

  updateModuleMeta(moduleId, updates) {
    const module = this.getModule(moduleId);

    if (!module) {
      return;
    }

    this.beginMutation();
    module.meta = ProjectSchema.createDefaultModuleMeta({
      ...(module.meta || {}),
      ...updates,
    });
    this.finalizeMutation();
  }

  toggleModuleCollapsed(moduleId) {
    const module = this.getModule(moduleId);

    if (!module) {
      return;
    }

    this.updateModuleUi(moduleId, {
      collapsed: !module.ui?.collapsed,
    });
  }

  duplicateModule(moduleId) {
    const originalModule = this.getModule(moduleId);

    if (!originalModule) {
      return null;
    }

    const copiedModule = Utils.clone(originalModule);
    copiedModule.id = Utils.uid("module");
    copiedModule.ui = {
      ...(copiedModule.ui || {}),
      collapsed: false,
    };

    this.regenerateNestedIds(copiedModule);

    const originalIndex = this.state.modules.findIndex(
      (module) => module.id === moduleId
    );

    this.beginMutation();
    this.state.modules.splice(originalIndex + 1, 0, copiedModule);
    this.finalizeMutation();

    return copiedModule;
  }

  regenerateNestedIds(module) {
    const data = module.data || {};
    const regenerateIds = (items, prefix) =>
      Utils.safeArray(items).map((item) => ({
        ...item,
        id: Utils.uid(prefix),
      }));

    if (module.type === "phone-thread") {
      data.messages = regenerateIds(data.messages, "msg");
    } else if (module.type === "forum-post") {
      data.replies = regenerateIds(data.replies, "reply");
    } else if (module.type === "transaction-record") {
      data.transactions = regenerateIds(data.transactions, "txn");
    } else if (module.type === "newspaper-article") {
      data.surroundingArticles = regenerateIds(
        data.surroundingArticles,
        "article"
      );
    } else if (module.type === "transcript") {
      data.speakers = regenerateIds(data.speakers, "speaker");
    }

    module.data = data;
  }

  deleteModule(moduleId) {
    this.beginMutation();

    this.state.modules = this.state.modules.filter(
      (module) => module.id !== moduleId
    );

    this.finalizeMutation();
  }

  moveModule(moduleId, direction) {
    const currentIndex = this.state.modules.findIndex(
      (module) => module.id === moduleId
    );

    const targetIndex = currentIndex + direction;

    if (
      currentIndex < 0 ||
      targetIndex < 0 ||
      targetIndex >= this.state.modules.length
    ) {
      return false;
    }

    this.beginMutation();

    [this.state.modules[currentIndex], this.state.modules[targetIndex]] = [
      this.state.modules[targetIndex],
      this.state.modules[currentIndex],
    ];

    this.finalizeMutation();
    return true;
  }

  moveModuleToIndex(moduleId, targetIndex) {
    const sourceIndex = this.state.modules.findIndex(
      (module) => module.id === moduleId
    );

    if (
      sourceIndex < 0 ||
      targetIndex < 0 ||
      targetIndex >= this.state.modules.length ||
      sourceIndex === targetIndex
    ) {
      return false;
    }

    this.beginMutation();

    const [module] = this.state.modules.splice(sourceIndex, 1);

    this.state.modules.splice(targetIndex, 0, module);

    this.finalizeMutation();
    return true;
  }
}

class AutosaveManager {
  constructor(store, options = {}) {
    this.store = store;

    this.storageKey =
      options.storageKey || "arg-narrative-editor-project-v4";

    this.delay = options.delay || 650;

    this.timer = null;
    this.statusListener = options.onStatusChange || (() => {});

    this.unsubscribe = this.store.subscribe((project) => {
      this.queueSave(project);
    });
  }

  queueSave(project) {
    clearTimeout(this.timer);

    this.statusListener("saving");

    this.timer = setTimeout(() => {
      try {
        const json = JSON.stringify(project);
        localStorage.setItem(this.storageKey, json);
        this.writeBackup(json);
        this.statusListener("saved");
      } catch (error) {
        console.error("[Autosave] Failed to save project.", error);
        this.statusListener("error");
      }
    }, this.delay);
  }

  writeBackup(json, force = false) {
    const key = `${this.storageKey}-backups`;
    try {
      const backups = this.listBackups();
      const last = backups[0];
      if (!force && last && Date.now() - last.savedAt < 60000) {
        return;
      }
      if (last && last.json === json) {
        return;
      }
      backups.unshift({ savedAt: Date.now(), json });
      localStorage.setItem(key, JSON.stringify(backups.slice(0, 5)));
    } catch (error) {
      console.warn("[Autosave] Backup skipped.", error);
    }
  }

  listBackups() {
    try {
      const parsed = JSON.parse(
        localStorage.getItem(`${this.storageKey}-backups`) || "[]"
      );
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  saveNow() {
    clearTimeout(this.timer);
    this.timer = null;

    try {
      const json = JSON.stringify(this.store.getState());
      localStorage.setItem(this.storageKey, json);
      this.writeBackup(json, true);
      this.statusListener("saved");
      return true;
    } catch (error) {
      console.error("[Autosave] Immediate save failed.", error);
      this.statusListener("error");
      return false;
    }
  }

  load() {
    try {
      const rawProject = localStorage.getItem(this.storageKey);

      if (!rawProject) {
        return null;
      }

      return JSON.parse(rawProject);
    } catch (error) {
      console.error("[Autosave] Failed to read saved project.", error);
      return null;
    }
  }

  clear() {
    clearTimeout(this.timer);
    this.timer = null;
    localStorage.removeItem(this.storageKey);
    this.statusListener("cleared");
  }

  destroy() {
    clearTimeout(this.timer);
    this.unsubscribe?.();
  }
}

/* -------------------------------------------------------------------------- */
/* CHARACTER THEME                                                             */
/* -------------------------------------------------------------------------- */

/**
 * This class centralizes every visual decision derived from a character.
 *
 * The key rule:
 * - Phone owner/perspective controls the phone frame and screen accents.
 * - Message sender controls the message bubble border, fill, label, and icon.
 *
 * Ashley can therefore be pink:
 * - on Ashley's pink phone,
 * - in Ashley's sent messages,
 * - and in Ashley's incoming messages shown on Rob's blue phone.
 */
class CharacterTheme {
  static getCssVariables(character) {
    const primary = character.primaryColor || "#7a7f8c";
    const soft = character.softColor || "#e4e6eb";
    const ink = Utils.contrastTextColor(soft);

    return [
      `--character-primary: ${primary}`,
      `--character-soft: ${soft}`,
      `--character-ink: ${ink}`,
    ].join("; ");
  }

  static getPhoneCssVariables(character) {
    const primary = character.primaryColor || "#4c78ff";
    const soft = character.softColor || "#dce6ff";
    const ink = Utils.contrastTextColor(soft);

    return [
      `--phone-primary: ${primary}`,
      `--phone-soft: ${soft}`,
      `--phone-ink: ${ink}`,
    ].join("; ");
  }

  static getBubbleCssVariables(character) {
    const primary = character.primaryColor || "#7a7f8c";
    const soft = character.softColor || "#e4e6eb";
    const ink = Utils.contrastTextColor(soft);

    return [
      `--speaker-primary: ${primary}`,
      `--speaker-soft: ${soft}`,
      `--speaker-ink: ${ink}`,
    ].join("; ");
  }
}

/* -------------------------------------------------------------------------- */
/* EXPORT HELPERS                                                              */
/* -------------------------------------------------------------------------- */

const DownloadHelper = {
  safeFilename(value, fallback = "story") {
    const cleaned = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return cleaned || fallback;
  },

  text(filename, content, mimeType = "text/plain;charset=utf-8") {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

const ReaderExporter = {
  exportProject(project) {
    const copy = Utils.clone(project);
    copy.modules = Utils.safeArray(copy.modules)
      .filter(
        (module) =>
          !module.meta?.draft &&
          module.ui?.draft !== true &&
          module.interactions?.visibleInReader !== false
      )
      .map((module) => {
        const { ui, ...rest } = module;
        if (rest.meta) {
          const { authorNote, draft, ...publicMeta } = rest.meta;
          rest.meta = publicMeta;
        }
        return rest;
      });
    copy.exportKind = "reader";
    copy.exportedAt = new Date().toISOString();
    return copy;
  },

  stringify(project) {
    return JSON.stringify(this.exportProject(project), null, 2);
  },
};

const StandaloneHtmlExporter = {
  widths: { narrow: "560px", standard: "780px", wide: "1040px" },
  fonts: {
    system:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    serif: 'Georgia, "Times New Roman", Times, serif',
    mono: '"Courier New", Courier, ui-monospace, monospace',
  },

  async getEditorCss() {
    const link = document.querySelector('link[rel="stylesheet"][href*="narrative_editor"]');

    if (link) {
      try {
        const response = await fetch(link.href);
        if (response.ok) {
          return await response.text();
        }
      } catch (error) {
        /* fall through to cssRules */
      }
    }

    if (link) {
      const text = await new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => resolve(xhr.responseText || "");
        xhr.onerror = () => resolve("");
        xhr.open("GET", link.href);
        xhr.send();
      });
      if (text) {
        return text;
      }
    }

    const chunks = [];
    for (const sheet of document.styleSheets) {
      try {
        chunks.push([...sheet.cssRules].map((rule) => rule.cssText).join("\n"));
      } catch (error) {
        /* cross-origin sheet */
      }
    }
    return chunks.join("\n");
  },

  escapeTitle(value) {
    return Utils.escapeHtml(value || "Untitled Story");
  },

  readerCss(settings) {
    const width = this.widths[settings.canvasWidth] || this.widths.standard;
    const font = this.fonts[settings.fontFamily] || this.fonts.system;
    const scale = { small: 0.92, normal: 1, large: 1.12, xlarge: 1.25 }[
      settings.readerTextSize
    ] || 1;
    const leading = { tight: 1.35, normal: 1.55, relaxed: 1.75 }[
      settings.readerLineSpacing
    ] || 1.55;

    return `
:root {
  --project-canvas-width: ${width};
  --project-font-family: ${font};
  --reader-scale: ${scale};
  --reader-leading: ${leading};
}
html, body { min-height: 100%; }
body.standalone-reader {
  margin: 0;
  padding: 32px 16px 72px;
  background: ${Utils.escapeHtml(settings.pageBackground || "#0c0d13")};
  font-family: var(--project-font-family);
  font-size: calc(16px * var(--reader-scale));
  line-height: var(--reader-leading);
  overflow: auto;
  height: auto;
}
.standalone-reader .reader-title {
  width: min(100%, var(--project-canvas-width));
  margin: 0 auto 18px;
}
.standalone-reader .reader-title h1 { margin: 0; font-size: 1.5em; }
.standalone-reader .reader-title p { margin: 4px 0 0; color: var(--text-muted); font-size: 0.8em; }
.standalone-reader .story-canvas { min-height: 0; }
.standalone-reader .placed-module { border-style: solid; cursor: default; }
.standalone-reader .module-text,
.standalone-reader p { line-height: var(--reader-leading); }
.standalone-reader .reader-contents {
  width: min(100%, var(--project-canvas-width));
  margin: 0 auto 18px;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-panel);
  color: var(--text-primary);
  font-size: 0.85em;
}
.standalone-reader .reader-contents summary { cursor: pointer; font-weight: 800; }
.standalone-reader .reader-contents a { display: block; padding: 4px 0; color: var(--accent-cyan); }
.standalone-reader a:focus-visible,
.standalone-reader summary:focus-visible,
.standalone-reader .placed-module:focus-visible {
  outline: 2px solid var(--accent-cyan);
  outline-offset: 2px;
}
.standalone-reader .reader-footer {
  width: min(100%, var(--project-canvas-width));
  margin: 24px auto 0;
  color: var(--text-muted);
  font-size: 0.75em;
  text-align: center;
}
@media print { body.standalone-reader::before, body.standalone-reader::after { display: none; } }
`;
  },

  async export(project, renderModule) {
    const readerProject = ReaderExporter.exportProject(project);
    const settings = readerProject.settings || {};
    const overlays = settings.overlays || {};
    const effects = settings.readerEffects || {};
    const editorCss = await this.getEditorCss();

    const bodyClasses = ["standalone-reader"];
    if (overlays.scanlines) bodyClasses.push("project-overlay-scanlines");
    if (overlays.vignette) bodyClasses.push("project-overlay-vignette");
    if (overlays.grain) bodyClasses.push("project-overlay-grain");
    if (overlays.crtFlicker) bodyClasses.push("project-overlay-crt-flicker");
    if (overlays.paperTexture) bodyClasses.push("project-overlay-paper-texture");
    if (overlays.reducedMotion) bodyClasses.push("project-reduced-motion");
    if (effects.redactionReveal) bodyClasses.push("reader-redaction-reveal");
    if (effects.imageGlitchOnHover) bodyClasses.push("reader-image-glitch");
    if (effects.evidenceFocusBlur) bodyClasses.push("reader-evidence-focus");

    const modulesHtml = readerProject.modules
      .map((module) => renderModule(module))
      .join("\n");

    const headings = readerProject.modules
      .filter((module) => module.type === "scene-heading")
      .map((module) => ({
        id: module.id,
        title: module.data?.title || module.data?.heading || "Scene",
      }));

    const contents = headings.length > 1
      ? `<details class="reader-contents"><summary>Contents</summary>${headings
          .map(
            (item) =>
              `<a href="#${Utils.escapeHtml(item.id)}">${Utils.escapeHtml(item.title)}</a>`
          )
          .join("")}</details>`
      : "";

    const json = JSON.stringify(readerProject)
      .replaceAll("<", "\\u003c")
      .replaceAll("\u2028", "\\u2028")
      .replaceAll("\u2029", "\\u2029");

    const safeCss = (value) => String(value).replaceAll("</style", "<\\/style");

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${this.escapeTitle(readerProject.title)}</title>
<style>
${safeCss(editorCss)}
${safeCss(this.readerCss(settings))}
</style>
</head>
<body class="${bodyClasses.join(" ")}">
<header class="reader-title">
  <h1>${this.escapeTitle(readerProject.title)}</h1>
  <p>${readerProject.modules.length} items</p>
</header>
${contents}
<main id="reader-app" class="story-canvas" data-bg-shape="${Utils.escapeHtml(settings.backgroundShape || "none")}" style="background-color: ${Utils.escapeHtml(settings.canvasBackground || "#0c0d13")}">
${modulesHtml}
</main>
<div class="reader-footer">Exported from ARG Narrative Media Editor</div>
<script id="reader-project-data" type="application/json">${json}</script>
<script>
${newspaperToggleStoryFocus.toString()}
document.addEventListener("click", function (event) {
  var story = event.target.closest(".newspaper-story[data-story-key]");
  var section = story && story.closest(".newspaper-article-module");
  if (section) newspaperToggleStoryFocus(section, story.dataset.storyKey);
});
document.addEventListener("keydown", function (event) {
  if (event.key !== "Enter" && event.key !== " ") return;
  var story = event.target.closest(".newspaper-story[data-story-key]");
  var section = story && story.closest(".newspaper-article-module");
  if (section && story === event.target) {
    event.preventDefault();
    newspaperToggleStoryFocus(section, story.dataset.storyKey);
  }
});
</script>
</body>
</html>
`;
  },
};

/* -------------------------------------------------------------------------- */
/* MODULE BASE CLASS                                                           */
/* -------------------------------------------------------------------------- */

class BaseModule {
  constructor(editor, moduleData) {
    this.editor = editor;
    this.store = editor.store;
    this.moduleData = moduleData;
  }

  get id() {
    return this.moduleData.id;
  }

  get type() {
    return this.moduleData.type;
  }

  get data() {
    return this.moduleData.data || {};
  }

  getStyleOverrideCss() {
    const overrides = this.moduleData.styleOverrides || {};
    const isSafeColor = (value) =>
      typeof value === "string" && /^[#a-z0-9(),.%\s-]+$/i.test(value);
    const styles = [];

    if (isSafeColor(overrides.borderColor)) {
      styles.push(`--module-border-color: ${overrides.borderColor}`);
    }

    if (isSafeColor(overrides.backgroundColor)) {
      styles.push(`--module-background-color: ${overrides.backgroundColor}`);
    }

    return styles.join("; ");
  }

  select() {
    this.editor.selectModule(this.id);
  }

  updateData(updates) {
    this.store.updateModuleData(this.id, updates);
  }

  async remove() {
    if (!(await askConfirm("Delete this module?", { confirmLabel: "Delete", danger: true }))) {
      return;
    }

    this.store.deleteModule(this.id);

    if (this.editor.selectedModuleId === this.id) {
      this.editor.selectedModuleId = null;
    }
  }

  renderActions() {
    const collapsed = Boolean(this.moduleData.ui?.collapsed);

    return `
      <div class="module-actions" aria-label="Module controls">
        ${this.editor.renderModuleWarningBadge(this.id)}

        <button
          class="module-action-btn module-drag-handle"
          type="button"
          data-module-action="drag-handle"
          title="Drag to reorder"
          aria-label="Drag to reorder module"
        >
          ⋮⋮
        </button>

        <button
          class="module-action-btn"
          type="button"
          data-module-action="move-up"
          title="Move module up"
          aria-label="Move module up"
        >
          ↑
        </button>

        <button
          class="module-action-btn"
          type="button"
          data-module-action="move-down"
          title="Move module down"
          aria-label="Move module down"
        >
          ↓
        </button>

        <button
          class="module-action-btn"
          type="button"
          data-module-action="duplicate"
          title="Duplicate module"
          aria-label="Duplicate module"
        >
          ⧉
        </button>

        <button
          class="module-action-btn"
          type="button"
          data-module-action="collapse"
          title="${collapsed ? "Expand module" : "Collapse module"}"
          aria-label="${collapsed ? "Expand module" : "Collapse module"}"
        >
          ${collapsed ? "▸" : "▾"}
        </button>

        <button
          class="module-action-btn"
          type="button"
          data-module-action="preview"
          title="Preview module"
          aria-label="Preview module"
        >
          ◉
        </button>

        <button
          class="module-action-btn delete"
          type="button"
          data-module-action="delete"
          title="Delete module"
          aria-label="Delete module"
        >
          ×
        </button>
      </div>
    `;
  }

  render() {
    throw new Error(
      `Module "${this.type}" must implement render().`
    );
  }

  renderInspector() {
    return `
      <div class="empty-inspector">
        <div class="empty-inspector-icon">!</div>
        <p>No inspector has been registered for this module.</p>
      </div>
    `;
  }

  bindInspectorEvents() {}

  bindCanvasEvents(container) {
    container.addEventListener("click", (event) => {
      const actionButton = event.target.closest("[data-module-action]");

      if (!actionButton) {
        this.select();
        return;
      }

      event.stopPropagation();

      const action = actionButton.dataset.moduleAction;

      if (action === "drag-handle") {
        return;
      }

      if (action === "move-up") {
        const moved = this.store.moveModule(this.id, -1);
        if (moved) this.editor.showToast("Module moved up.");
        return;
      }

      if (action === "move-down") {
        const moved = this.store.moveModule(this.id, 1);
        if (moved) this.editor.showToast("Module moved down.");
        return;
      }

      if (action === "duplicate") {
        const duplicate = this.store.duplicateModule(this.id);

        if (duplicate) {
          this.editor.selectModule(duplicate.id);
          this.editor.showToast("Module duplicated.");
        }
        return;
      }

      if (action === "collapse") {
        this.store.toggleModuleCollapsed(this.id);
        const isCollapsed = Boolean(
          this.store.getModule(this.id)?.ui?.collapsed
        );
        this.editor.showToast(
          isCollapsed ? "Module collapsed." : "Module expanded."
        );
        return;
      }

      if (action === "preview") {
        this.editor.openModulePreview(this.id);
        return;
      }

      if (action === "delete") {
        this.remove();
      }
    });

    container.addEventListener("keydown", (event) => {
      if (event.target.closest("input, textarea, select, button")) {
        return;
      }

      if (!event.altKey) {
        return;
      }

      this.editor.selectedModuleId = this.id;
      const key = event.key.toLowerCase();

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (this.store.moveModule(this.id, -1)) {
          this.editor.showToast("Module moved up.");
        }
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        if (this.store.moveModule(this.id, 1)) {
          this.editor.showToast("Module moved down.");
        }
      } else if (key === "d") {
        event.preventDefault();
        const duplicate = this.store.duplicateModule(this.id);
        if (duplicate) {
          this.editor.selectModule(duplicate.id);
          this.editor.showToast("Module duplicated.");
        }
      } else if (key === "c") {
        event.preventDefault();
        this.store.toggleModuleCollapsed(this.id);
        const isCollapsed = Boolean(
          this.store.getModule(this.id)?.ui?.collapsed
        );
        this.editor.showToast(
          isCollapsed ? "Module collapsed." : "Module expanded."
        );
      }
    });
  }
}
/* -------------------------------------------------------------------------- */
/* MODULE DEFINITIONS */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* PHONE THREAD MODULE                                                         */
/* -------------------------------------------------------------------------- */

class PhoneThreadModule extends BaseModule {
  static get type() {
    return "phone-thread";
  }

  static createDefault(store) {
    const characters = store.getState().characters;
    const owner = characters[0];
    const other = characters[1] || owner;

    return {
      id: Utils.uid("module"),
      type: PhoneThreadModule.type,
      data: {
        ownerCharacterId: owner?.id || "",
        contactLabel: other?.name || "Unknown Contact",
        subtitle: "iMessage",
        dateLabel: "Thursday, 11:42 PM",
        theme: "light",
        messages: [
          {
            id: Utils.uid("msg"),
            senderCharacterId: other?.id || owner?.id || "",
            text: "Are you still awake?",
            time: "11:42 PM",
          },
          {
            id: Utils.uid("msg"),
            senderCharacterId: owner?.id || "",
            text: "I found the file you mentioned.",
            time: "11:43 PM",
          },
        ],
      },
    };
  }

  get ownerCharacter() {
    return this.store.getCharacterOrFallback(this.data.ownerCharacterId);
  }

  getMessageSender(message) {
    return this.store.getCharacterOrFallback(message.senderCharacterId);
  }

  renderMessage(message) {
  if (message.kind === "date-banner") {
    return `
      <div class="phone-date-divider">
        ${Utils.escapeHtml(message.text || "")}
      </div>
    `;
  }

  if (message.kind === "typing") {
    const sender = this.getMessageSender(message);
    const isOwner = sender.id === this.ownerCharacter.id;
    const positionClass = isOwner ? "is-owner" : "is-other";

    return `
      <div class="message-row ${positionClass}">
        <div
          class="message-bubble typing-indicator"
          style="${CharacterTheme.getBubbleCssVariables(sender)}"
        >
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
        </div>
      </div>
    `;
  }

  if (message.kind === "system") {
    return `
      <div class="phone-system-notice" role="note">
        ${Utils.escapeHtml(message.text || "")}
      </div>
    `;
  }

  const sender = this.getMessageSender(message);
  const isOwner = sender.id === this.ownerCharacter.id;
  const positionClass = isOwner ? "is-owner" : "is-other";
  const senderLabel = isOwner ? "You" : sender.name;
  const kind = message.kind || "text";

  if (kind === "reaction") {
    return `
      <div class="message-row ${positionClass}">
        <div class="message-reaction" style="${CharacterTheme.getBubbleCssVariables(sender)}">
          <span class="message-reaction-emoji">${Utils.escapeHtml(message.text || "👍")}</span>
          <span class="message-reaction-label">${Utils.escapeHtml(isOwner ? "You reacted" : `${sender.name} reacted`)}</span>
        </div>
      </div>
    `;
  }

  const kindIcons = { call: "☎", audio: "▶", image: "🖼" };
  const kindLabels = { call: "Call", audio: "Audio message", image: "Image" };
  const kindBody = {
    call: () => `
      <span class="message-kind-icon" aria-hidden="true">${kindIcons.call}</span>
      <span class="message-kind-body">
        <span class="message-kind-title">${Utils.escapeHtml(message.text || "Call")}</span>
        ${message.time ? `<span class="message-kind-meta">${Utils.escapeHtml(message.time)}</span>` : ""}
      </span>`,
    audio: () => `
      <span class="message-kind-icon" aria-hidden="true">${kindIcons.audio}</span>
      <span class="message-kind-body">
        <span class="message-audio-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
        <span class="message-kind-meta">${Utils.escapeHtml(message.text || "0:00")}</span>
      </span>`,
    image: () => `
      <span class="message-image-frame" role="img" aria-label="${Utils.escapeHtml(message.text || "Image attachment")}">
        <span class="message-kind-icon" aria-hidden="true">${kindIcons.image}</span>
      </span>
      ${message.text ? `<span class="message-text">${Utils.escapeHtml(message.text)}</span>` : ""}`,
  };

  if (kindBody[kind]) {
    return `
      <div class="message-row ${positionClass}">
        <div
          class="message-bubble message-kind-${kind}"
          style="${CharacterTheme.getBubbleCssVariables(sender)}"
          aria-label="${kindLabels[kind]}"
        >
          ${kindBody[kind]()}
          ${kind !== "call" && message.time ? `<span class="message-time">${Utils.escapeHtml(message.time)}</span>` : ""}
          ${message.status ? `<span class="message-status">${Utils.escapeHtml(message.status)}</span>` : ""}
        </div>
      </div>
    `;
  }

  return `
    <div class="message-row ${positionClass}">
      <div
        class="message-bubble"
        style="${CharacterTheme.getBubbleCssVariables(sender)}"
      >
        ${
          this.data.groupParticipants?.length
            ? `
              <span class="message-sender">
                ${Utils.escapeHtml(senderLabel)}
              </span>
            `
            : ""
        }

        <span class="message-text">
          ${Utils.escapeHtml(message.text || "")}
        </span>

        ${
          message.time
            ? `
              <span class="message-time">
                ${Utils.escapeHtml(message.time)}
              </span>
            `
            : ""
        }

        ${
          message.status
            ? `
              <span class="message-status">
                ${Utils.escapeHtml(message.status)}
              </span>
            `
            : ""
        }
      </div>
    </div>
  `;
}

  getStatusTime() {
    const custom = String(this.data.statusTime || "").trim();

    if (custom) {
      return custom;
    }

    const latest = Utils.safeArray(this.data.messages)
      .filter((message) => message.time && message.kind !== "date-banner")
      .pop();

    return latest?.time || "9:41";
  }

  render() {
    const owner = this.ownerCharacter;
    const isDark = this.data.theme === "dark";

    return `
      <article
        class="placed-module ${
          this.editor.selectedModuleId === this.id ? "selected" : ""
        }"
        data-module-id="${this.id}"
      >
        ${this.renderActions()}

        <section
          class="phone-module ${isDark ? "theme-dark" : "theme-light"}"
          style="${CharacterTheme.getPhoneCssVariables(owner)}"
        >
          <div class="phone-screen">
            <div class="phone-notch"></div>

            <div class="phone-status">
              <span>${Utils.escapeHtml(this.getStatusTime())}</span>
              <span>${Utils.escapeHtml(this.data.statusSignal ?? "▮▮▮ 5G ▰")}</span>
            </div>

            <div class="phone-perspective-badge">
              <span
                class="character-avatar"
                style="${CharacterTheme.getCssVariables(owner)}"
              >
                ${Utils.escapeHtml(owner.avatar || owner.shortName?.charAt(0) || "?")}
              </span>
              ${Utils.escapeHtml(owner.name)}'s phone
            </div>

            <div class="phone-chat-header">
              <div>
                <div class="phone-contact-name">
                  ${Utils.escapeHtml(this.data.contactLabel || "Messages")}
                </div>
                <div class="phone-contact-subtitle">
                  ${Utils.escapeHtml(this.data.subtitle || "Messages")}
                </div>
              </div>
            </div>

            ${
              this.data.dateLabel
                ? `
                  <div class="phone-date-divider">
                    ${Utils.escapeHtml(this.data.dateLabel)}
                  </div>
                `
                : ""
            }

            <div class="phone-message-list">
              ${Utils.safeArray(this.data.messages)
                .map((message) => this.renderMessage(message))
                .join("")}
            </div>

            <div class="phone-home-bar"></div>
          </div>
        </section>
      </article>
    `;
  }

  renderInspector() {
    const characters = this.store.getState().characters;
    const ownerOptions = characters
      .map((character) => {
        const selected =
          character.id === this.data.ownerCharacterId ? "selected" : "";

        return `
          <option value="${character.id}" ${selected}>
            ${Utils.escapeHtml(character.name)}
          </option>
        `;
      })
      .join("");

    const messages = Utils.safeArray(this.data.messages)
      .map((message, index) => {
        const senderOptions = characters
          .map((character) => {
            const selected =
              character.id === message.senderCharacterId ? "selected" : "";

            return `
              <option value="${character.id}" ${selected}>
                ${Utils.escapeHtml(character.name)}
              </option>
            `;
          })
          .join("");

        return `
          <article draggable="true" class="message-editor-card" data-message-id="${message.id}">
            <div class="message-editor-topline">
              <span class="message-editor-label">Message ${index + 1}</span>

              <div class="message-editor-actions">
                <button
                  type="button"
                  data-message-action="up"
                  title="Move message up"
                >
                  ↑
                </button>

                <button
                  type="button"
                  data-message-action="down"
                  title="Move message down"
                >
                  ↓
                </button>

                <button
                  type="button"
                  class="delete"
                  data-message-action="delete"
                  title="Delete message"
                >
                  ×
                </button>
              </div>
            </div>

            <div class="form-group">
              <label>Message type</label>
              <select class="form-control" data-message-field="kind">
                ${[
                  ["text", "Text message"],
                  ["date-banner", "Date banner"],
                  ["typing", "Typing indicator"],
                  ["call", "Call"],
                  ["audio", "Audio message"],
                  ["image", "Image"],
                  ["system", "System notice"],
                  ["reaction", "Reaction"],
                ]
                  .map(
                    ([value, label]) =>
                      `<option value="${value}" ${
                        (message.kind || "text") === value ? "selected" : ""
                      }>${label}</option>`
                  )
                  .join("")}
              </select>
            </div>

            <div class="form-group">
              <label>Speaker</label>
              <select
                class="form-control"
                data-message-field="senderCharacterId"
              >
                ${senderOptions}
              </select>
            </div>

            <div class="form-group">
              <label>Message text (caption, duration or emoji for special types)</label>
              <textarea
                class="form-control"
                data-message-field="text"
              >${Utils.escapeHtml(message.text)}</textarea>
            </div>

            <div class="form-group">
              <label>Timestamp</label>
              <input
                class="form-control"
                type="text"
                value="${Utils.escapeHtml(message.time || "")}"
                data-message-field="time"
                placeholder="11:42 PM"
              />
            </div>

            <div class="form-group">
              <label>Status (optional)</label>
              <input
                class="form-control"
                type="text"
                value="${Utils.escapeHtml(message.status || "")}"
                data-message-field="status"
                placeholder="Delivered, Read 11:43 PM"
              />
            </div>
          </article>
        `;
      })
      .join("");

    return `
      <section class="inspector-section">
        <h3 class="inspector-section-title">Phone Perspective</h3>

        <div class="form-group">
          <label>Phone owner / perspective</label>
          <select id="phone-owner-select" class="form-control">
            ${ownerOptions}
          </select>
        </div>

        <div class="inspector-row">
          <div class="form-group">
            <label>Phone theme</label>
            <select id="phone-theme-select" class="form-control">
              <option value="light" ${
                this.data.theme === "light" ? "selected" : ""
              }>
                Light
              </option>
              <option value="dark" ${
                this.data.theme === "dark" ? "selected" : ""
              }>
                Dark
              </option>
            </select>
          </div>

          <div class="form-group">
            <label>Contact subtitle</label>
            <input
              id="phone-subtitle-input"
              class="form-control"
              type="text"
              value="${Utils.escapeHtml(this.data.subtitle || "")}"
              placeholder="iMessage"
            />
          </div>
        </div>

        <div class="form-group">
          <label>Contact display name</label>
          <input
            id="phone-contact-input"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.contactLabel || "")}"
            placeholder="Ashley"
          />
        </div>

        <div class="inspector-row">
          <div class="form-group">
            <label>Status bar time</label>
            <input
              id="phone-status-time-input"
              class="form-control"
              type="text"
              value="${Utils.escapeHtml(this.data.statusTime || "")}"
              placeholder="Auto: ${Utils.escapeHtml(this.getStatusTime())}"
            />
          </div>

          <div class="form-group">
            <label>Status bar signal</label>
            <input
              id="phone-status-signal-input"
              class="form-control"
              type="text"
              value="${Utils.escapeHtml(this.data.statusSignal ?? "▮▮▮ 5G ▰")}"
            />
          </div>
        </div>

        <div class="form-group">
          <label>Date divider</label>
          <input
            id="phone-date-input"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.dateLabel || "")}"
            placeholder="Thursday, 11:42 PM"
          />
        </div>
      </section>

      <section class="inspector-section">
        <h3 class="inspector-section-title">Messages</h3>

        <div id="message-editor-list" class="message-editor-list">
          ${messages || `<p class="sidebar-help">No messages yet.</p>`}
        </div>

        <button
          id="add-message-btn"
          type="button"
          class="btn btn-secondary add-message-btn"
        >
          + Add Message
        </button>
      </section>
    `;
  }

  bindInspectorEvents(inspectorElement) {
    const updateModuleField = (selector, dataField) => {
      const element = inspectorElement.querySelector(selector);

      if (!element) {
        return;
      }

      element.addEventListener("input", () => {
        this.updateData({
          [dataField]: element.value,
        });
      });

      element.addEventListener("change", () => {
        this.updateData({
          [dataField]: element.value,
        });
      });
    };

    updateModuleField("#phone-owner-select", "ownerCharacterId");
    updateModuleField("#phone-theme-select", "theme");
    updateModuleField("#phone-contact-input", "contactLabel");
    updateModuleField("#phone-subtitle-input", "subtitle");
    updateModuleField("#phone-date-input", "dateLabel");
    updateModuleField("#phone-status-time-input", "statusTime");
    updateModuleField("#phone-status-signal-input", "statusSignal");

    const addMessageButton = inspectorElement.querySelector("#add-message-btn");

    addMessageButton?.addEventListener("click", () => {
      const owner = this.ownerCharacter;
      const messages = Utils.clone(Utils.safeArray(this.data.messages));

      messages.push({
        id: Utils.uid("msg"),
        senderCharacterId: owner.id,
        text: "New message",
        time: "",
      });

      this.updateData({ messages });
    });

    inspectorElement
      .querySelectorAll("[data-message-id]")
      .forEach((messageCard) => {
        const messageId = messageCard.dataset.messageId;

        messageCard
          .querySelectorAll("[data-message-field]")
          .forEach((field) => {
            const saveMessageField = () => {
              const messages = Utils.clone(Utils.safeArray(this.data.messages));
              const message = messages.find((item) => item.id === messageId);

              if (!message) {
                return;
              }

              message[field.dataset.messageField] = field.value;
              this.updateData({ messages });
            };

            field.addEventListener("input", saveMessageField);
            field.addEventListener("change", saveMessageField);
          });

        messageCard
          .querySelectorAll("[data-message-action]")
          .forEach((button) => {
            button.addEventListener("click", () => {
              const action = button.dataset.messageAction;
              const messages = Utils.clone(Utils.safeArray(this.data.messages));
              const currentIndex = messages.findIndex(
                (message) => message.id === messageId
              );

              if (currentIndex < 0) {
                return;
              }

              if (action === "delete") {
                messages.splice(currentIndex, 1);
                this.updateData({ messages });
                return;
              }

              const targetIndex =
                action === "up" ? currentIndex - 1 : currentIndex + 1;

              if (targetIndex < 0 || targetIndex >= messages.length) {
                return;
              }

              [messages[currentIndex], messages[targetIndex]] = [
                messages[targetIndex],
                messages[currentIndex],
              ];

              this.updateData({ messages });
            });
          });
      });
  }
}


/* --------------------------------------------------------------------------*/
/* TERMINAL MODULE */
/* -------------------------------------------------------------------------- */
class TerminalModule extends BaseModule {
  static get type() {
    return "terminal";
  }

  static createDefault() {
    return {
      id: Utils.uid("module"),
      type: TerminalModule.type,
      data: {
        title: "BLACKWATER ARCHIVE TERMINAL",
        systemName: "BWA-NODE-07",
        prompt: "operator@blackwater:~$",
        status: "CONNECTED",
        lines: [
          "$ connect --node BWA-NODE-07",
          "Handshake accepted.",
          "$ query records --subject \"ASHLEY\"",
          "3 restricted records found.",
          "WARNING: Access event logged.",
        ],
        showCursor: true,
        variant: "green",
      },
    };
  }

  renderTerminalLine(line) {
    const safeLine = Utils.escapeHtml(line);

    if (line.startsWith("ERROR") || line.startsWith("WARNING")) {
      return `<div class="terminal-line terminal-line-warning">${safeLine}</div>`;
    }

    if (line.startsWith("$")) {
      return `<div class="terminal-line terminal-line-command">${safeLine}</div>`;
    }

    return `<div class="terminal-line">${safeLine}</div>`;
  }

  render() {
    const selectedClass =
      this.editor.selectedModuleId === this.id ? "selected" : "";

    const variantClass =
      this.data.variant === "amber" ? "terminal-amber" : "terminal-green";

    return `
      <article
        class="placed-module ${selectedClass}"
        data-module-id="${this.id}"
      >
        ${this.renderActions()}

        <section class="terminal-module ${variantClass}">
          <div class="terminal-topbar">
            <div class="terminal-lights">
              <span></span>
              <span></span>
              <span></span>
            </div>

            <div class="terminal-title">
              ${Utils.escapeHtml(this.data.title || "SYSTEM TERMINAL")}
            </div>

            <div class="terminal-status">
              ${Utils.escapeHtml(this.data.status || "CONNECTED")}
            </div>
          </div>

          <div class="terminal-body">
            <div class="terminal-system-line">
              [${Utils.escapeHtml(this.data.systemName || "NODE-01")}]
            </div>

            ${Utils.safeArray(this.data.lines)
              .map((line) => this.renderTerminalLine(line))
              .join("")}

            ${
              this.data.showCursor
                ? `
                  <div class="terminal-line terminal-cursor-line">
                    ${Utils.escapeHtml(this.data.prompt || "$")}
                    <span class="terminal-cursor"></span>
                  </div>
                `
                : ""
            }
          </div>
        </section>
      </article>
    `;
  }

  renderInspector() {
    return `
      <section class="inspector-section">
        <h3 class="inspector-section-title">Terminal Identity</h3>

        <div class="form-group">
          <label>Terminal title</label>
          <input
            id="terminal-title"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.title || "")}"
          />
        </div>

        <div class="inspector-row">
          <div class="form-group">
            <label>System / node name</label>
            <input
              id="terminal-system-name"
              class="form-control"
              type="text"
              value="${Utils.escapeHtml(this.data.systemName || "")}"
            />
          </div>

          <div class="form-group">
            <label>Status</label>
            <input
              id="terminal-status"
              class="form-control"
              type="text"
              value="${Utils.escapeHtml(this.data.status || "")}"
            />
          </div>
        </div>

        <div class="form-group">
          <label>Terminal color</label>
          <select id="terminal-variant" class="form-control">
            <option value="green" ${
              this.data.variant === "green" ? "selected" : ""
            }>
              Phosphor green
            </option>
            <option value="amber" ${
              this.data.variant === "amber" ? "selected" : ""
            }>
              Amber monitor
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>Prompt text</label>
          <input
            id="terminal-prompt"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.prompt || "")}"
          />
        </div>
      </section>

      <section class="inspector-section">
        <h3 class="inspector-section-title">Terminal Output</h3>

        <div class="form-group">
          <label>One line per terminal entry</label>
          <textarea
            id="terminal-lines"
            class="form-control"
          >${Utils.escapeHtml(Utils.safeArray(this.data.lines).join("\n"))}</textarea>
        </div>

        <div class="form-group">
          <label>
            <input
              id="terminal-show-cursor"
              type="checkbox"
              ${this.data.showCursor ? "checked" : ""}
            />
            Show blinking cursor
          </label>
        </div>
      </section>
    `;
  }

  bindInspectorEvents(inspectorElement) {
    const textFields = [
      ["#terminal-title", "title"],
      ["#terminal-system-name", "systemName"],
      ["#terminal-status", "status"],
      ["#terminal-variant", "variant"],
      ["#terminal-prompt", "prompt"],
    ];

    textFields.forEach(([selector, fieldName]) => {
      const input = inspectorElement.querySelector(selector);

      const saveValue = () => {
        this.updateData({
          [fieldName]: input.value,
        });
      };

      input?.addEventListener("input", saveValue);
      input?.addEventListener("change", saveValue);
    });

    const linesInput = inspectorElement.querySelector("#terminal-lines");

    linesInput?.addEventListener("input", () => {
      const lines = linesInput.value
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0);

      this.updateData({ lines });
    });

    const cursorInput = inspectorElement.querySelector("#terminal-show-cursor");

    cursorInput?.addEventListener("change", () => {
      this.updateData({
        showCursor: cursorInput.checked,
      });
    });
  }
}

/* --------------------------------------------------------------------------*/
/* TERMINAL MODULE */
/* -------------------------------------------------------------------------- */

class OfficialReportModule extends BaseModule {
  static get type() {
    return "official-report";
  }

  static createDefault() {
    return {
      id: Utils.uid("module"),
      type: OfficialReportModule.type,
      data: {
        reportType: "Police Incident Report",
        agencyName: "Blackwater County Sheriff's Office",
        classification: "CONFIDENTIAL",
        caseNumber: "BW-04-1187",
        dateFiled: "October 14, 2004",
        officerName: "Det. R. Holloway",
        subjectName: "Ashley M.",
        location: "Blackwater Reservoir Access Road",
        status: "Open Investigation",
        remarks:
          "Witness reported an unidentified vehicle parked near the south access road between 11:15 PM and 11:40 PM.",
        evidence: "One disposable camera; partial tire impression; audio cassette.",
      },
    };
  }

  render() {
    const selectedClass =
      this.editor.selectedModuleId === this.id ? "selected" : "";

    return `
      <article
        class="placed-module ${selectedClass}"
        data-module-id="${this.id}"
      >
        ${this.renderActions()}

        <section class="official-report-module">
          <div class="official-report-banner">
            <div>
              <div class="official-report-agency">
                ${Utils.escapeHtml(this.data.agencyName || "Official Agency")}
              </div>

              <div class="official-report-type">
                ${Utils.escapeHtml(this.data.reportType || "Incident Report")}
              </div>
            </div>

            <div class="official-report-classification">
              ${Utils.escapeHtml(this.data.classification || "CONFIDENTIAL")}
            </div>
          </div>

          <div class="official-report-grid">
            <div class="official-field">
              <span>Case No.</span>
              <strong>${Utils.escapeHtml(this.data.caseNumber || "N/A")}</strong>
            </div>

            <div class="official-field">
              <span>Date Filed</span>
              <strong>${Utils.escapeHtml(this.data.dateFiled || "N/A")}</strong>
            </div>

            <div class="official-field">
              <span>Investigating Officer</span>
              <strong>${Utils.escapeHtml(this.data.officerName || "N/A")}</strong>
            </div>

            <div class="official-field">
              <span>Subject / Victim</span>
              <strong>${Utils.escapeHtml(this.data.subjectName || "N/A")}</strong>
            </div>

            <div class="official-field official-field-full">
              <span>Location</span>
              <strong>${Utils.escapeHtml(this.data.location || "N/A")}</strong>
            </div>

            <div class="official-field official-field-full">
              <span>Case Status</span>
              <strong>${Utils.escapeHtml(this.data.status || "N/A")}</strong>
            </div>
          </div>

          <div class="official-report-section">
            <div class="official-section-label">Remarks / Narrative Summary</div>
            <p>${Utils.escapeHtml(this.data.remarks || "")}</p>
          </div>

          <div class="official-report-section">
            <div class="official-section-label">Evidence Logged</div>
            <p>${Utils.escapeHtml(this.data.evidence || "")}</p>
          </div>

          <div class="official-signature-row">
            <div>
              <span>Prepared By</span>
              <div class="official-signature-line"></div>
            </div>

            <div>
              <span>Supervisor Review</span>
              <div class="official-signature-line"></div>
            </div>
          </div>
        </section>
      </article>
    `;
  }

  renderInspector() {
    return `
      <section class="inspector-section">
        <h3 class="inspector-section-title">Document Header</h3>

        <div class="form-group">
          <label>Report type</label>
          <select id="report-type" class="form-control">
            <option value="Police Incident Report" ${
              this.data.reportType === "Police Incident Report"
                ? "selected"
                : ""
            }>
              Police Incident Report
            </option>

            <option value="Medical Autopsy Report" ${
              this.data.reportType === "Medical Autopsy Report"
                ? "selected"
                : ""
            }>
              Medical Autopsy Report
            </option>

            <option value="Missing Person Report" ${
              this.data.reportType === "Missing Person Report"
                ? "selected"
                : ""
            }>
              Missing Person Report
            </option>

            <option value="Evidence Intake Report" ${
              this.data.reportType === "Evidence Intake Report"
                ? "selected"
                : ""
            }>
              Evidence Intake Report
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>Agency / organization name</label>
          <input
            id="report-agency-name"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.agencyName || "")}"
          />
        </div>

        <div class="inspector-row">
          <div class="form-group">
            <label>Classification</label>
            <input
              id="report-classification"
              class="form-control"
              type="text"
              value="${Utils.escapeHtml(this.data.classification || "")}"
            />
          </div>

          <div class="form-group">
            <label>Case number</label>
            <input
              id="report-case-number"
              class="form-control"
              type="text"
              value="${Utils.escapeHtml(this.data.caseNumber || "")}"
            />
          </div>
        </div>
      </section>

      <section class="inspector-section">
        <h3 class="inspector-section-title">Case Details</h3>

        <div class="form-group">
          <label>Date filed</label>
          <input
            id="report-date-filed"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.dateFiled || "")}"
          />
        </div>

        <div class="form-group">
          <label>Investigating officer / examiner</label>
          <input
            id="report-officer-name"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.officerName || "")}"
          />
        </div>

        <div class="form-group">
          <label>Subject / victim name</label>
          <input
            id="report-subject-name"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.subjectName || "")}"
          />
        </div>

        <div class="form-group">
          <label>Location</label>
          <input
            id="report-location"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.location || "")}"
          />
        </div>

        <div class="form-group">
          <label>Case status</label>
          <input
            id="report-status"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.status || "")}"
          />
        </div>
      </section>

      <section class="inspector-section">
        <h3 class="inspector-section-title">Narrative</h3>

        <div class="form-group">
          <label>Remarks / summary</label>
          <textarea
            id="report-remarks"
            class="form-control"
          >${Utils.escapeHtml(this.data.remarks || "")}</textarea>
        </div>

        <div class="form-group">
          <label>Evidence logged</label>
          <textarea
            id="report-evidence"
            class="form-control"
          >${Utils.escapeHtml(this.data.evidence || "")}</textarea>
        </div>
      </section>
    `;
  }

  bindInspectorEvents(inspectorElement) {
    const fields = [
      ["#report-type", "reportType"],
      ["#report-agency-name", "agencyName"],
      ["#report-classification", "classification"],
      ["#report-case-number", "caseNumber"],
      ["#report-date-filed", "dateFiled"],
      ["#report-officer-name", "officerName"],
      ["#report-subject-name", "subjectName"],
      ["#report-location", "location"],
      ["#report-status", "status"],
      ["#report-remarks", "remarks"],
      ["#report-evidence", "evidence"],
    ];

    fields.forEach(([selector, fieldName]) => {
      const input = inspectorElement.querySelector(selector);

      const saveValue = () => {
        this.updateData({
          [fieldName]: input.value,
        });
      };

      input?.addEventListener("input", saveValue);
      input?.addEventListener("change", saveValue);
    });
  }
}



/* -------------------------------------------------------------------------- */
/* Handwritten Note Module                                                        */
/* -------------------------------------------------------------------------- */

class HandwrittenNoteModule extends BaseModule {
  static get type() {
    return "handwritten-note";
  }

  static createDefault() {
    return {
      id: Utils.uid("module"),
      type: HandwrittenNoteModule.type,
      data: {
        style: "ruled",
        date: "October 12, 2004",
        author: "Ashley",
        title: "Don't let them find this.",
        body:
          "I heard the radio come on by itself again at 2:13 AM.\n\nThe voice knew my name. It said the lake was not empty.",
        rotation: -1,
      },
    };
  }

  render() {
    const selectedClass =
      this.editor.selectedModuleId === this.id ? "selected" : "";

    const rotation = Number(this.data.rotation || 0);
    const paperClass =
      this.data.style === "crumpled"
        ? "handwritten-paper-crumpled"
        : "handwritten-paper-ruled";

    return `
      <article
        class="placed-module ${selectedClass}"
        data-module-id="${this.id}"
      >
        ${this.renderActions()}

        <section
          class="handwritten-note-module ${paperClass}"
          style="--note-rotation: ${rotation}deg"
        >
          <div class="handwritten-note-date">
            ${Utils.escapeHtml(this.data.date || "")}
          </div>

          <div class="handwritten-note-author">
            ${Utils.escapeHtml(this.data.author || "")}
          </div>

          <h2 class="handwritten-note-title">
            ${Utils.escapeHtml(this.data.title || "")}
          </h2>

          <div class="handwritten-note-body">
            ${Utils.escapeHtml(this.data.body || "")}
          </div>
        </section>
      </article>
    `;
  }

  renderInspector() {
    return `
      <section class="inspector-section">
        <h3 class="inspector-section-title">Paper Style</h3>

        <div class="inspector-row">
          <div class="form-group">
            <label>Paper background</label>
            <select id="handwritten-style" class="form-control">
              <option value="ruled" ${
                this.data.style === "ruled" ? "selected" : ""
              }>
                Ruled diary paper
              </option>

              <option value="crumpled" ${
                this.data.style === "crumpled" ? "selected" : ""
              }>
                Aged / crumpled paper
              </option>
            </select>
          </div>

          <div class="form-group">
            <label>Rotation</label>
            <input
              id="handwritten-rotation"
              class="form-control"
              type="number"
              min="-8"
              max="8"
              step="0.25"
              value="${Utils.escapeHtml(this.data.rotation ?? 0)}"
            />
          </div>
        </div>
      </section>

      <section class="inspector-section">
        <h3 class="inspector-section-title">Entry Content</h3>

        <div class="inspector-row">
          <div class="form-group">
            <label>Date</label>
            <input
              id="handwritten-date"
              class="form-control"
              type="text"
              value="${Utils.escapeHtml(this.data.date || "")}"
            />
          </div>

          <div class="form-group">
            <label>Author</label>
            <input
              id="handwritten-author"
              class="form-control"
              type="text"
              value="${Utils.escapeHtml(this.data.author || "")}"
            />
          </div>
        </div>

        <div class="form-group">
          <label>Title</label>
          <input
            id="handwritten-title"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.title || "")}"
          />
        </div>

        <div class="form-group">
          <label>Diary / note text</label>
          <textarea
            id="handwritten-body"
            class="form-control"
          >${Utils.escapeHtml(this.data.body || "")}</textarea>
        </div>
      </section>
    `;
  }

  bindInspectorEvents(inspectorElement) {
    const fields = [
      ["#handwritten-style", "style"],
      ["#handwritten-date", "date"],
      ["#handwritten-author", "author"],
      ["#handwritten-title", "title"],
      ["#handwritten-body", "body"],
      ["#handwritten-rotation", "rotation"],
    ];

    fields.forEach(([selector, fieldName]) => {
      const input = inspectorElement.querySelector(selector);

      const saveValue = () => {
        const value =
          fieldName === "rotation" ? Number(input.value || 0) : input.value;

        this.updateData({
          [fieldName]: value,
        });
      };

      input?.addEventListener("input", saveValue);
      input?.addEventListener("change", saveValue);
    });
  }
}



/* -------------------------------------------------------------------------- */
/* Bank Statement Module                                                       */
/* -------------------------------------------------------------------------- */


class TransactionRecordModule extends BaseModule {
  static get type() {
    return "transaction-record";
  }

  static createDefault() {
    return {
      id: Utils.uid("module"),
      type: TransactionRecordModule.type,
      data: {
        documentType: "Bank Statement",
        institutionName: "Blackwater Federal Credit Union",
        accountLabel: "Everyday Checking",
        accountSuffix: "8842",
        statementPeriod: "October 1–31, 2004",
        openingBalance: "$1,824.17",
        closingBalance: "$1,247.90",
        transactions: [
          {
            id: Utils.uid("txn"),
            date: "10/12",
            merchant: "LAKEVIEW GAS & MART",
            location: "Blackwater, MA",
            amount: "-$42.18",
          },
          {
            id: Utils.uid("txn"),
            date: "10/13",
            merchant: "BLACKWATER PHOTO LAB",
            location: "Framingham, MA",
            amount: "-$16.73",
          },
          {
            id: Utils.uid("txn"),
            date: "10/14",
            merchant: "ATM CASH WITHDRAWAL",
            location: "Blackwater, MA",
            amount: "-$300.00",
          },
        ],
      },
    };
  }

  renderTransaction(transaction) {
    return `
      <tr>
        <td>${Utils.escapeHtml(transaction.date || "")}</td>
        <td>
          <strong>${Utils.escapeHtml(transaction.merchant || "")}</strong>
          <small>${Utils.escapeHtml(transaction.location || "")}</small>
        </td>
        <td class="transaction-amount">
          ${Utils.escapeHtml(transaction.amount || "")}
        </td>
      </tr>
    `;
  }

  render() {
    const selectedClass =
      this.editor.selectedModuleId === this.id ? "selected" : "";

    const isReceipt = this.data.documentType === "Receipt";

    return `
      <article
        class="placed-module ${selectedClass}"
        data-module-id="${this.id}"
      >
        ${this.renderActions()}

        <section class="transaction-record-module ${
          isReceipt ? "receipt-mode" : "statement-mode"
        }">
          <div class="transaction-record-header">
            <div>
              <div class="transaction-record-institution">
                ${Utils.escapeHtml(this.data.institutionName || "")}
              </div>

              <div class="transaction-record-document-type">
                ${Utils.escapeHtml(this.data.documentType || "Bank Statement")}
              </div>
            </div>

            <div class="transaction-record-account">
              ${Utils.escapeHtml(this.data.accountLabel || "Account")}
              <strong>•••• ${Utils.escapeHtml(this.data.accountSuffix || "")}</strong>
            </div>
          </div>

          <div class="transaction-record-summary">
            <div>
              <span>Statement Period</span>
              <strong>${Utils.escapeHtml(this.data.statementPeriod || "")}</strong>
            </div>

            <div>
              <span>Opening Balance</span>
              <strong>${Utils.escapeHtml(this.data.openingBalance || "")}</strong>
            </div>

            <div>
              <span>Closing Balance</span>
              <strong>${Utils.escapeHtml(this.data.closingBalance || "")}</strong>
            </div>
          </div>

          <table class="transaction-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description / Location</th>
                <th>Amount</th>
              </tr>
            </thead>

            <tbody>
              ${Utils.safeArray(this.data.transactions)
                .map((transaction) => this.renderTransaction(transaction))
                .join("")}
            </tbody>
          </table>
        </section>
      </article>
    `;
  }

  renderInspector() {
    const transactions = Utils.safeArray(this.data.transactions)
      .map((transaction, index) => {
        return `
          <article
            class="message-editor-card"
            data-transaction-id="${transaction.id}"
          >
            <div class="message-editor-topline">
              <span class="message-editor-label">
                Transaction ${index + 1}
              </span>

              <div class="message-editor-actions">
                <button
                  type="button"
                  data-transaction-action="up"
                  title="Move transaction up"
                >
                  ↑
                </button>

                <button
                  type="button"
                  data-transaction-action="down"
                  title="Move transaction down"
                >
                  ↓
                </button>

                <button
                  type="button"
                  class="delete"
                  data-transaction-action="delete"
                  title="Delete transaction"
                >
                  ×
                </button>
              </div>
            </div>

            <div class="inspector-row">
              <div class="form-group">
                <label>Date</label>
                <input
                  class="form-control"
                  type="text"
                  value="${Utils.escapeHtml(transaction.date || "")}"
                  data-transaction-field="date"
                />
              </div>

              <div class="form-group">
                <label>Amount</label>
                <input
                  class="form-control"
                  type="text"
                  value="${Utils.escapeHtml(transaction.amount || "")}"
                  data-transaction-field="amount"
                />
              </div>
            </div>

            <div class="form-group">
              <label>Merchant / description</label>
              <input
                class="form-control"
                type="text"
                value="${Utils.escapeHtml(transaction.merchant || "")}"
                data-transaction-field="merchant"
              />
            </div>

            <div class="form-group">
              <label>Location</label>
              <input
                class="form-control"
                type="text"
                value="${Utils.escapeHtml(transaction.location || "")}"
                data-transaction-field="location"
              />
            </div>
          </article>
        `;
      })
      .join("");

    return `
      <section class="inspector-section">
        <h3 class="inspector-section-title">Document Identity</h3>

        <div class="form-group">
          <label>Document type</label>
          <select id="transaction-document-type" class="form-control">
            <option value="Bank Statement" ${
              this.data.documentType === "Bank Statement" ? "selected" : ""
            }>
              Bank Statement
            </option>

            <option value="Receipt" ${
              this.data.documentType === "Receipt" ? "selected" : ""
            }>
              Receipt
            </option>

            <option value="Credit Card Activity" ${
              this.data.documentType === "Credit Card Activity"
                ? "selected"
                : ""
            }>
              Credit Card Activity
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>Institution / store name</label>
          <input
            id="transaction-institution"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.institutionName || "")}"
          />
        </div>

        <div class="inspector-row">
          <div class="form-group">
            <label>Account label</label>
            <input
              id="transaction-account-label"
              class="form-control"
              type="text"
              value="${Utils.escapeHtml(this.data.accountLabel || "")}"
            />
          </div>

          <div class="form-group">
            <label>Account suffix</label>
            <input
              id="transaction-account-suffix"
              class="form-control"
              type="text"
              value="${Utils.escapeHtml(this.data.accountSuffix || "")}"
            />
          </div>
        </div>

        <div class="form-group">
          <label>Statement period / receipt date</label>
          <input
            id="transaction-statement-period"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.statementPeriod || "")}"
          />
        </div>

        <div class="inspector-row">
          <div class="form-group">
            <label>Opening balance</label>
            <input
              id="transaction-opening-balance"
              class="form-control"
              type="text"
              value="${Utils.escapeHtml(this.data.openingBalance || "")}"
            />
          </div>

          <div class="form-group">
            <label>Closing balance</label>
            <input
              id="transaction-closing-balance"
              class="form-control"
              type="text"
              value="${Utils.escapeHtml(this.data.closingBalance || "")}"
            />
          </div>
        </div>
      </section>

      <section class="inspector-section">
        <h3 class="inspector-section-title">Transactions</h3>

        <div id="transaction-editor-list" class="message-editor-list">
          ${transactions}
        </div>

        <button
          id="add-transaction-btn"
          type="button"
          class="btn btn-secondary add-message-btn"
        >
          + Add Transaction
        </button>
      </section>
    `;
  }

  bindInspectorEvents(inspectorElement) {
    const documentFields = [
      ["#transaction-document-type", "documentType"],
      ["#transaction-institution", "institutionName"],
      ["#transaction-account-label", "accountLabel"],
      ["#transaction-account-suffix", "accountSuffix"],
      ["#transaction-statement-period", "statementPeriod"],
      ["#transaction-opening-balance", "openingBalance"],
      ["#transaction-closing-balance", "closingBalance"],
    ];

    documentFields.forEach(([selector, fieldName]) => {
      const input = inspectorElement.querySelector(selector);

      const saveValue = () => {
        this.updateData({
          [fieldName]: input.value,
        });
      };

      input?.addEventListener("input", saveValue);
      input?.addEventListener("change", saveValue);
    });

    const addTransactionButton = inspectorElement.querySelector(
      "#add-transaction-btn"
    );

    addTransactionButton?.addEventListener("click", () => {
      const transactions = Utils.clone(
        Utils.safeArray(this.data.transactions)
      );

      transactions.push({
        id: Utils.uid("txn"),
        date: "",
        merchant: "NEW TRANSACTION",
        location: "",
        amount: "$0.00",
      });

      this.updateData({ transactions });
    });

    inspectorElement
      .querySelectorAll("[data-transaction-id]")
      .forEach((transactionCard) => {
        const transactionId = transactionCard.dataset.transactionId;

        transactionCard
          .querySelectorAll("[data-transaction-field]")
          .forEach((field) => {
            const saveValue = () => {
              const transactions = Utils.clone(
                Utils.safeArray(this.data.transactions)
              );

              const transaction = transactions.find(
                (item) => item.id === transactionId
              );

              if (!transaction) {
                return;
              }

              transaction[field.dataset.transactionField] = field.value;

              this.updateData({ transactions });
            };

            field.addEventListener("input", saveValue);
            field.addEventListener("change", saveValue);
          });

        transactionCard
          .querySelectorAll("[data-transaction-action]")
          .forEach((button) => {
            button.addEventListener("click", () => {
              const action = button.dataset.transactionAction;

              const transactions = Utils.clone(
                Utils.safeArray(this.data.transactions)
              );

              const currentIndex = transactions.findIndex(
                (transaction) => transaction.id === transactionId
              );

              if (currentIndex < 0) {
                return;
              }

              if (action === "delete") {
                transactions.splice(currentIndex, 1);
                this.updateData({ transactions });
                return;
              }

              const targetIndex =
                action === "up" ? currentIndex - 1 : currentIndex + 1;

              if (
                targetIndex < 0 ||
                targetIndex >= transactions.length
              ) {
                return;
              }

              [transactions[currentIndex], transactions[targetIndex]] = [
                transactions[targetIndex],
                transactions[currentIndex],
              ];

              this.updateData({ transactions });
            });
          });
      });
  }
}


/* -------------------------------------------------------------------------- */
/* Forum Posts Module                                                        */
/* -------------------------------------------------------------------------- */
class ForumPostModule extends BaseModule {
  static get type() {
    return "forum-post";
  }

  static createDefault(store) {
    const characters = store.getState().characters;
    const ashley = characters[0];
    const rob = characters[1];

    return {
      id: Utils.uid("module"),
      type: ForumPostModule.type,
      data: {
        style: "web1",
        boardName: "/blackwater/",
        boardSubtitle: "Unexplained events, local sightings, archived rumors",
        title: "Did anyone else see the lights over the reservoir?",
        authorName: "lakewatcher2004",
        authorCharacterId: ashley?.id || "",
        timestamp: "10/14/2004 01:13 AM",
        body:
          "I was driving past the south access road when I saw three lights over the water. They were not planes.",
        replies: [
          {
            id: Utils.uid("reply"),
            authorName: "federal_signal",
            authorCharacterId: rob?.id || "",
            timestamp: "10/14/2004 01:17 AM",
            quote: "three lights over the water",
            body:
              "You are not the first person to report this. Did you hear anything on your radio?",
            depth: 0,
          },
          {
            id: Utils.uid("reply"),
            authorName: "lakewatcher2004",
            authorCharacterId: ashley?.id || "",
            timestamp: "10/14/2004 01:22 AM",
            quote: "Did you hear anything on your radio?",
            body:
              "Yes. A woman was repeating the same phrase, but I could not make out the words.",
            depth: 1,
          },
        ],
      },
    };
  }

  getCharacter(characterId) {
    return characterId
      ? this.store.getCharacter(characterId)
      : null;
  }

  renderAuthorBadge(characterId, fallbackName) {
    const character = this.getCharacter(characterId);

    if (!character) {
      return `
        <span class="forum-avatar forum-avatar-generic">
          ${Utils.escapeHtml((fallbackName || "?").charAt(0).toUpperCase())}
        </span>
      `;
    }

    return `
      <span
        class="forum-avatar"
        style="${CharacterTheme.getCssVariables(character)}"
      >
        ${Utils.escapeHtml(character.avatar || character.name.charAt(0))}
      </span>
    `;
  }

  renderReply(reply) {
    const depth = Math.min(Math.max(Number(reply.depth || 0), 0), 3);
    const character = this.getCharacter(reply.authorCharacterId);
    const authorStyle = character
      ? CharacterTheme.getCssVariables(character)
      : "";

    return `
      <article
        class="forum-reply forum-reply-depth-${depth}"
        style="${authorStyle}"
      >
        <div class="forum-reply-header">
          <div class="forum-author">
            ${this.renderAuthorBadge(reply.authorCharacterId, reply.authorName)}

            <strong>${Utils.escapeHtml(reply.authorName || "anonymous")}</strong>
          </div>

          <time>${Utils.escapeHtml(reply.timestamp || "")}</time>
        </div>

        ${
          reply.quote
            ? `
              <blockquote class="forum-quote">
                &gt; ${Utils.escapeHtml(reply.quote)}
              </blockquote>
            `
            : ""
        }

        <div class="forum-reply-body">
          ${Utils.escapeHtml(reply.body || "")}
        </div>
      </article>
    `;
  }

  render() {
    const selectedClass =
      this.editor.selectedModuleId === this.id ? "selected" : "";

    const styleClass = `forum-style-${this.data.style || "web1"}`;
    const authorCharacter = this.getCharacter(this.data.authorCharacterId);
    const authorStyle = authorCharacter
      ? CharacterTheme.getCssVariables(authorCharacter)
      : "";

    return `
      <article
        class="placed-module ${selectedClass}"
        data-module-id="${this.id}"
      >
        ${this.renderActions()}

        <section class="forum-module ${styleClass}">
          <header class="forum-board-header">
            <div>
              <div class="forum-board-name">
                ${Utils.escapeHtml(this.data.boardName || "/board/")}
              </div>

              <div class="forum-board-subtitle">
                ${Utils.escapeHtml(this.data.boardSubtitle || "")}
              </div>
            </div>

            <div class="forum-board-tools">
              [Catalog] [Archive] [Reply]
            </div>
          </header>

          <article draggable="true" class="forum-original-post" style="${authorStyle}">
            <div class="forum-post-meta">
              <div class="forum-author">
                ${this.renderAuthorBadge(
                  this.data.authorCharacterId,
                  this.data.authorName
                )}

                <strong>
                  ${Utils.escapeHtml(this.data.authorName || "anonymous")}
                </strong>
              </div>

              <time>${Utils.escapeHtml(this.data.timestamp || "")}</time>
            </div>

            <h2 class="forum-post-title">
              ${Utils.escapeHtml(this.data.title || "")}
            </h2>

            <div class="forum-post-body">
              ${Utils.escapeHtml(this.data.body || "")}
            </div>
          </article>

          <div class="forum-replies">
            ${Utils.safeArray(this.data.replies)
              .map((reply) => this.renderReply(reply))
              .join("")}
          </div>
        </section>
      </article>
    `;
  }

  renderInspector() {
    const characters = this.store.getState().characters;

    const authorOptions = (selectedId) => {
      return `
        <option value="">No character link</option>
        ${characters
          .map((character) => {
            const selected = character.id === selectedId ? "selected" : "";

            return `
              <option value="${character.id}" ${selected}>
                ${Utils.escapeHtml(character.name)}
              </option>
            `;
          })
          .join("")}
      `;
    };

    const replies = Utils.safeArray(this.data.replies)
      .map((reply, index) => {
        return `
          <article draggable="true" class="message-editor-card" data-reply-id="${reply.id}">
            <div class="message-editor-topline">
              <span class="message-editor-label">
                Reply ${index + 1}
              </span>

              <div class="message-editor-actions">
                <button
                  type="button"
                  data-reply-action="up"
                  title="Move reply up"
                >
                  ↑
                </button>

                <button
                  type="button"
                  data-reply-action="down"
                  title="Move reply down"
                >
                  ↓
                </button>

                <button
                  type="button"
                  class="delete"
                  data-reply-action="delete"
                  title="Delete reply"
                >
                  ×
                </button>
              </div>
            </div>

            <div class="inspector-row">
              <div class="form-group">
                <label>Username</label>
                <input
                  class="form-control"
                  type="text"
                  value="${Utils.escapeHtml(reply.authorName || "")}"
                  data-reply-field="authorName"
                />
              </div>

              <div class="form-group">
                <label>Character link</label>
                <select
                  class="form-control"
                  data-reply-field="authorCharacterId"
                >
                  ${authorOptions(reply.authorCharacterId)}
                </select>
              </div>
            </div>

            <div class="form-group">
              <label>Timestamp</label>
              <input
                class="form-control"
                type="text"
                value="${Utils.escapeHtml(reply.timestamp || "")}"
                data-reply-field="timestamp"
              />
            </div>

            <div class="form-group">
              <label>Quoted text</label>
              <input
                class="form-control"
                type="text"
                value="${Utils.escapeHtml(reply.quote || "")}"
                data-reply-field="quote"
              />
            </div>

            <div class="form-group">
              <label>Reply text</label>
              <textarea
                class="form-control"
                data-reply-field="body"
              >${Utils.escapeHtml(reply.body || "")}</textarea>
            </div>

            <div class="form-group">
              <label>Nesting level</label>
              <select class="form-control" data-reply-field="depth">
                <option value="0" ${
                  Number(reply.depth || 0) === 0 ? "selected" : ""
                }>Top-level reply</option>

                <option value="1" ${
                  Number(reply.depth || 0) === 1 ? "selected" : ""
                }>Nested reply</option>

                <option value="2" ${
                  Number(reply.depth || 0) === 2 ? "selected" : ""
                }>Deep nested reply</option>

                <option value="3" ${
                  Number(reply.depth || 0) === 3 ? "selected" : ""
                }>Maximum nested reply</option>
              </select>
            </div>
          </article>
        `;
      })
      .join("");

    return `
      <section class="inspector-section">
        <h3 class="inspector-section-title">Board Appearance</h3>

        <div class="form-group">
          <label>Forum visual style</label>
          <select id="forum-style" class="form-control">
            <option value="web1" ${
              this.data.style === "web1" ? "selected" : ""
            }>
              Web 1.0 / early forum
            </option>

            <option value="imageboard" ${
              this.data.style === "imageboard" ? "selected" : ""
            }>
              Image board
            </option>

            <option value="reddit" ${
              this.data.style === "reddit" ? "selected" : ""
            }>
              Modern discussion board
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>Board name</label>
          <input
            id="forum-board-name"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.boardName || "")}"
          />
        </div>

        <div class="form-group">
          <label>Board subtitle</label>
          <input
            id="forum-board-subtitle"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.boardSubtitle || "")}"
          />
        </div>
      </section>

      <section class="inspector-section">
        <h3 class="inspector-section-title">Original Post</h3>

        <div class="inspector-row">
          <div class="form-group">
            <label>Username</label>
            <input
              id="forum-author-name"
              class="form-control"
              type="text"
              value="${Utils.escapeHtml(this.data.authorName || "")}"
            />
          </div>

          <div class="form-group">
            <label>Character link</label>
            <select id="forum-author-character" class="form-control">
              ${authorOptions(this.data.authorCharacterId)}
            </select>
          </div>
        </div>

        <div class="form-group">
          <label>Timestamp</label>
          <input
            id="forum-timestamp"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.timestamp || "")}"
          />
        </div>

        <div class="form-group">
          <label>Post title</label>
          <input
            id="forum-title"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.title || "")}"
          />
        </div>

        <div class="form-group">
          <label>Post body</label>
          <textarea
            id="forum-body"
            class="form-control"
          >${Utils.escapeHtml(this.data.body || "")}</textarea>
        </div>
      </section>

      <section class="inspector-section">
        <h3 class="inspector-section-title">Replies</h3>

        <div id="forum-reply-editor-list" class="message-editor-list">
          ${replies}
        </div>

        <button
          id="add-forum-reply-btn"
          type="button"
          class="btn btn-secondary add-message-btn"
        >
          + Add Reply
        </button>
      </section>
    `;
  }

  bindInspectorEvents(inspectorElement) {
    const postFields = [
      ["#forum-style", "style"],
      ["#forum-board-name", "boardName"],
      ["#forum-board-subtitle", "boardSubtitle"],
      ["#forum-author-name", "authorName"],
      ["#forum-author-character", "authorCharacterId"],
      ["#forum-timestamp", "timestamp"],
      ["#forum-title", "title"],
      ["#forum-body", "body"],
    ];

    postFields.forEach(([selector, fieldName]) => {
      const input = inspectorElement.querySelector(selector);

      const saveValue = () => {
        this.updateData({
          [fieldName]: input.value,
        });
      };

      input?.addEventListener("input", saveValue);
      input?.addEventListener("change", saveValue);
    });

    const addReplyButton = inspectorElement.querySelector(
      "#add-forum-reply-btn"
    );

    addReplyButton?.addEventListener("click", () => {
      const replies = Utils.clone(Utils.safeArray(this.data.replies));

      replies.push({
        id: Utils.uid("reply"),
        authorName: "anonymous",
        authorCharacterId: "",
        timestamp: "",
        quote: "",
        body: "New reply",
        depth: 0,
      });

      this.updateData({ replies });
    });

    inspectorElement.querySelectorAll("[data-reply-id]").forEach((replyCard) => {
      const replyId = replyCard.dataset.replyId;

      replyCard
        .querySelectorAll("[data-reply-field]")
        .forEach((field) => {
          const saveValue = () => {
            const replies = Utils.clone(Utils.safeArray(this.data.replies));

            const reply = replies.find((item) => item.id === replyId);

            if (!reply) {
              return;
            }

            reply[field.dataset.replyField] =
              field.dataset.replyField === "depth"
                ? Number(field.value)
                : field.value;

            this.updateData({ replies });
          };

          field.addEventListener("input", saveValue);
          field.addEventListener("change", saveValue);
        });

      replyCard
        .querySelectorAll("[data-reply-action]")
        .forEach((button) => {
          button.addEventListener("click", () => {
            const action = button.dataset.replyAction;
            const replies = Utils.clone(Utils.safeArray(this.data.replies));

            const currentIndex = replies.findIndex(
              (reply) => reply.id === replyId
            );

            if (currentIndex < 0) {
              return;
            }

            if (action === "delete") {
              replies.splice(currentIndex, 1);
              this.updateData({ replies });
              return;
            }

            const targetIndex =
              action === "up" ? currentIndex - 1 : currentIndex + 1;

            if (targetIndex < 0 || targetIndex >= replies.length) {
              return;
            }

            [replies[currentIndex], replies[targetIndex]] = [
              replies[targetIndex],
              replies[currentIndex],
            ];

            this.updateData({ replies });
          });
        });
    });
  }
}

/* -------------------------------------------------------------------------- */
/* SCENE HEADING MODULE                                                        */
/* -------------------------------------------------------------------------- */

class SceneHeadingModule extends BaseModule {
  static get type() {
    return "scene-heading";
  }

  static createDefault() {
    return {
      id: Utils.uid("module"),
      type: SceneHeadingModule.type,
      data: {
        kicker: "Chapter One",
        title: "The Message That Shouldn't Exist",
        subtitle: "Framingham, Massachusetts — October 2004",
      },
    };
  }

  render() {
    return `
      <article
        class="placed-module ${
          this.editor.selectedModuleId === this.id ? "selected" : ""
        }"
        data-module-id="${this.id}"
      >
        ${this.renderActions()}

        <section class="scene-heading-module">
          <div class="scene-heading-kicker">
            ${Utils.escapeHtml(this.data.kicker || "")}
          </div>

          <h2 class="scene-heading-title">
            ${Utils.escapeHtml(this.data.title || "")}
          </h2>

          <p class="scene-heading-subtitle">
            ${Utils.escapeHtml(this.data.subtitle || "")}
          </p>
        </section>
      </article>
    `;
  }

  renderInspector() {
    return `
      <section class="inspector-section">
        <h3 class="inspector-section-title">Heading Content</h3>

        <div class="form-group">
          <label>Kicker</label>
          <input
            id="scene-kicker"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.kicker || "")}"
          />
        </div>

        <div class="form-group">
          <label>Title</label>
          <input
            id="scene-title"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.title || "")}"
          />
        </div>

        <div class="form-group">
          <label>Subtitle</label>
          <input
            id="scene-subtitle"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.subtitle || "")}"
          />
        </div>
      </section>
    `;
  }

  bindInspectorEvents(inspectorElement) {
    const fields = [
      ["#scene-kicker", "kicker"],
      ["#scene-title", "title"],
      ["#scene-subtitle", "subtitle"],
    ];

    fields.forEach(([selector, fieldName]) => {
      const input = inspectorElement.querySelector(selector);

      input?.addEventListener("input", () => {
        this.updateData({
          [fieldName]: input.value,
        });
      });
    });
  }
}

/* -------------------------------------------------------------------------- */
/* NOTE CARD MODULE                                                            */
/* -------------------------------------------------------------------------- */

class NoteCardModule extends BaseModule {
  static get type() {
    return "note-card";
  }

  static createDefault() {
    return {
      id: Utils.uid("module"),
      type: NoteCardModule.type,
      data: {
        label: "Recovered Evidence",
        title: "Handwritten Note",
        body: "If you receive another message from this number, do not reply.",
      },
    };
  }

  render() {
    return `
      <article
        class="placed-module ${
          this.editor.selectedModuleId === this.id ? "selected" : ""
        }"
        data-module-id="${this.id}"
      >
        ${this.renderActions()}

        <section class="note-card-module">
          <div class="note-card-label">
            ${Utils.escapeHtml(this.data.label || "")}
          </div>

          <h2 class="note-card-title">
            ${Utils.escapeHtml(this.data.title || "")}
          </h2>

          <div class="note-card-body">
            ${Utils.escapeHtml(this.data.body || "")}
          </div>
        </section>
      </article>
    `;
  }

  renderInspector() {
    return `
      <section class="inspector-section">
        <h3 class="inspector-section-title">Note Content</h3>

        <div class="form-group">
          <label>Evidence label</label>
          <input
            id="note-label"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.label || "")}"
          />
        </div>

        <div class="form-group">
          <label>Title</label>
          <input
            id="note-title"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.title || "")}"
          />
        </div>

        <div class="form-group">
          <label>Body</label>
          <textarea
            id="note-body"
            class="form-control"
          >${Utils.escapeHtml(this.data.body || "")}</textarea>
        </div>
      </section>
    `;
  }

  bindInspectorEvents(inspectorElement) {
    const fields = [
      ["#note-label", "label"],
      ["#note-title", "title"],
      ["#note-body", "body"],
    ];

    fields.forEach(([selector, fieldName]) => {
      const input = inspectorElement.querySelector(selector);

      input?.addEventListener("input", () => {
        this.updateData({
          [fieldName]: input.value,
        });
      });
    });
  }
}

/* -------------------------------------------------------------------------- */
/* evidence/photo media module definition */
/* -------------------------------------------------------------------------- */
class EvidenceMediaModule extends BaseModule {
  static get type() {
    return "evidence-media";
  }

  static createDefault() {
    return {
      id: Utils.uid("module"),
      type: EvidenceMediaModule.type,
      data: {
        style: "polaroid",
        imageUrl: "",
        altText: "Evidence photograph",
        caption: "Recovered from the south access road.",
        metadata: "IMG_1044.jpg · 10/14/2004 · 12:06 AM",
        showMetadata: true,
      },
    };
  }

  renderMediaPlaceholder() {
    if (this.data.imageUrl) {
      return `
        <img
          class="evidence-media-image"
          src="${Utils.escapeHtml(this.data.imageUrl)}"
          alt="${Utils.escapeHtml(this.data.altText || "Evidence image")}"
        />
      `;
    }

    return `
      <div class="evidence-media-placeholder">
        <div class="evidence-placeholder-icon">▧</div>
        <div>NO IMAGE ATTACHED</div>
        <small>Add an image URL in the inspector.</small>
      </div>
    `;
  }

  render() {
    const selectedClass =
      this.editor.selectedModuleId === this.id ? "selected" : "";

    const styleClass =
      this.data.style === "cctv"
        ? "evidence-media-cctv"
        : "evidence-media-polaroid";

    return `
      <article
        class="placed-module ${selectedClass}"
        data-module-id="${this.id}"
      >
        ${this.renderActions()}

        <section class="evidence-media-module ${styleClass}">
          <div class="evidence-media-visual">
            ${this.renderMediaPlaceholder()}

            ${
              this.data.style === "cctv"
                ? `
                  <div class="cctv-overlay">
                    <span>CAM 03</span>
                    <span>REC ●</span>
                  </div>
                `
                : ""
            }
          </div>

          ${
            this.data.caption
              ? `
                <div class="evidence-media-caption">
                  ${Utils.escapeHtml(this.data.caption)}
                </div>
              `
              : ""
          }

          ${
            this.data.showMetadata && this.data.metadata
              ? `
                <div class="evidence-media-meta">
                  ${Utils.escapeHtml(this.data.metadata)}
                </div>
              `
              : ""
          }
        </section>
      </article>
    `;
  }

  renderInspector() {
    return `
      <section class="inspector-section">
        <h3 class="inspector-section-title">Media Presentation</h3>

        <div class="form-group">
          <label>Visual style</label>
          <select id="evidence-style" class="form-control">
            <option value="polaroid" ${
              this.data.style === "polaroid" ? "selected" : ""
            }>
              Polaroid photograph
            </option>

            <option value="cctv" ${
              this.data.style === "cctv" ? "selected" : ""
            }>
              CCTV footage
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>Image URL</label>
          <input
            id="evidence-image-url"
            class="form-control"
            type="url"
            value="${Utils.escapeHtml(this.data.imageUrl || "")}"
            placeholder="https://example.com/evidence.jpg"
          />
        </div>

        <div class="form-group">
          <label>Image alt text</label>
          <input
            id="evidence-alt-text"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.altText || "")}"
          />
        </div>
      </section>

      <section class="inspector-section">
        <h3 class="inspector-section-title">Evidence Labeling</h3>

        <div class="form-group">
          <label>Caption</label>
          <textarea
            id="evidence-caption"
            class="form-control"
          >${Utils.escapeHtml(this.data.caption || "")}</textarea>
        </div>

        <div class="form-group">
          <label>Metadata line</label>
          <input
            id="evidence-metadata"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.metadata || "")}"
          />
        </div>

        <div class="form-group">
          <label>
            <input
              id="evidence-show-metadata"
              type="checkbox"
              ${this.data.showMetadata ? "checked" : ""}
            />
            Show metadata
          </label>
        </div>
      </section>
    `;
  }

  bindInspectorEvents(inspectorElement) {
    const fields = [
      ["#evidence-style", "style"],
      ["#evidence-image-url", "imageUrl"],
      ["#evidence-alt-text", "altText"],
      ["#evidence-caption", "caption"],
      ["#evidence-metadata", "metadata"],
    ];

    fields.forEach(([selector, fieldName]) => {
      const input = inspectorElement.querySelector(selector);

      const save = () => {
        this.updateData({
          [fieldName]: input.value,
        });
      };

      input?.addEventListener("input", save);
      input?.addEventListener("change", save);
    });

    const metadataToggle = inspectorElement.querySelector(
      "#evidence-show-metadata"
    );

    metadataToggle?.addEventListener("change", () => {
      this.updateData({
        showMetadata: metadataToggle.checked,
      });
    });
  }
}

/* ------------------- */
/* broken link/unavailable module type handler */
/* ---- broken link/unavailable module type handler ---- */

class BrokenLinkModule extends BaseModule {
  static get type() {
    return "broken-link";
  }

  static createDefault() {
    return {
      id: Utils.uid("module"),
      type: BrokenLinkModule.type,
      data: {
        browserTitle: "404 Not Found",
        url: "www.blackwaterarchive.net/incident/1187",
        errorCode: "404",
        headline: "This page is no longer available.",
        detail:
          "The requested record may have been moved, deleted, or restricted by the site administrator.",
        style: "browser",
      },
    };
  }

  render() {
    const selectedClass =
      this.editor.selectedModuleId === this.id ? "selected" : "";

    const styleClass =
      this.data.style === "terminal"
        ? "broken-link-terminal"
        : "broken-link-browser";

    return `
      <article
        class="placed-module ${selectedClass}"
        data-module-id="${this.id}"
      >
        ${this.renderActions()}

        <section class="broken-link-module ${styleClass}">
          <div class="broken-link-toolbar">
            <span class="broken-link-dot"></span>
            <span class="broken-link-dot"></span>
            <span class="broken-link-dot"></span>

            <div class="broken-link-url">
              ${Utils.escapeHtml(this.data.url || "")}
            </div>
          </div>

          <div class="broken-link-content">
            <div class="broken-link-code">
              ${Utils.escapeHtml(this.data.errorCode || "404")}
            </div>

            <h2>${Utils.escapeHtml(this.data.headline || "")}</h2>

            <p>${Utils.escapeHtml(this.data.detail || "")}</p>

            <div class="broken-link-footer">
              ${Utils.escapeHtml(this.data.browserTitle || "Error")}
            </div>
          </div>
        </section>
      </article>
    `;
  }

  renderInspector() {
    return `
      <section class="inspector-section">
        <h3 class="inspector-section-title">Broken Link</h3>

        <div class="form-group">
          <label>Visual style</label>
          <select id="broken-link-style" class="form-control">
            <option value="browser" ${
              this.data.style === "browser" ? "selected" : ""
            }>
              Browser error page
            </option>

            <option value="terminal" ${
              this.data.style === "terminal" ? "selected" : ""
            }>
              Terminal/network failure
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>Page / browser title</label>
          <input
            id="broken-link-browser-title"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.browserTitle || "")}"
          />
        </div>

        <div class="form-group">
          <label>Visible URL</label>
          <input
            id="broken-link-url"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.url || "")}"
          />
        </div>

        <div class="inspector-row">
          <div class="form-group">
            <label>Error code</label>
            <input
              id="broken-link-code"
              class="form-control"
              type="text"
              value="${Utils.escapeHtml(this.data.errorCode || "")}"
            />
          </div>

          <div class="form-group">
            <label>Headline</label>
            <input
              id="broken-link-headline"
              class="form-control"
              type="text"
              value="${Utils.escapeHtml(this.data.headline || "")}"
            />
          </div>
        </div>

        <div class="form-group">
          <label>Error detail</label>
          <textarea
            id="broken-link-detail"
            class="form-control"
          >${Utils.escapeHtml(this.data.detail || "")}</textarea>
        </div>
      </section>
    `;
  }

  bindInspectorEvents(inspectorElement) {
    const fields = [
      ["#broken-link-style", "style"],
      ["#broken-link-browser-title", "browserTitle"],
      ["#broken-link-url", "url"],
      ["#broken-link-code", "errorCode"],
      ["#broken-link-headline", "headline"],
      ["#broken-link-detail", "detail"],
    ];

    fields.forEach(([selector, fieldName]) => {
      const input = inspectorElement.querySelector(selector);

      const save = () => {
        this.updateData({
          [fieldName]: input.value,
        });
      };

      input?.addEventListener("input", save);
      input?.addEventListener("change", save);
    });
  }
}

/* -------------------------------------------------------------------------- */
/* email/official module type handler */
/* -------------------------------------------------------------------------- */

class EmailDocumentModule extends BaseModule {
  static get type() {
    return "email-document";
  }

  static createDefault(store) {
    const sender = store.getState().characters[0];

    return {
      id: Utils.uid("module"),
      type: EmailDocumentModule.type,
      data: {
        documentStyle: "email",
        classification: "INTERNAL USE ONLY",
        fromName: sender?.name || "Unknown Sender",
        fromAddress: "archive@blackwater.test",
        toAddress: "records@blackwater.test",
        subject: "Re: Reservoir access records",
        date: "October 14, 2004, 8:12 AM",
        body:
          "The attached access records should not have been released.\n\nPlease remove the public copy before anyone connects it to the incident.",
        signature: "Records Administration",
      },
    };
  }

  render() {
    const selectedClass =
      this.editor.selectedModuleId === this.id ? "selected" : "";

    const memoClass =
      this.data.documentStyle === "memo"
        ? "email-document-memo"
        : "email-document-email";

    return `
      <article
        class="placed-module ${selectedClass}"
        data-module-id="${this.id}"
      >
        ${this.renderActions()}

        <section class="email-document-module ${memoClass}">
          <div class="email-document-classification">
            ${Utils.escapeHtml(this.data.classification || "")}
          </div>

          <div class="email-document-header">
            <div><span>From:</span> ${Utils.escapeHtml(this.data.fromName || "")} &lt;${Utils.escapeHtml(this.data.fromAddress || "")}&gt;</div>
            <div><span>To:</span> ${Utils.escapeHtml(this.data.toAddress || "")}</div>
            <div><span>Date:</span> ${Utils.escapeHtml(this.data.date || "")}</div>
            <div><span>Subject:</span> <strong>${Utils.escapeHtml(this.data.subject || "")}</strong></div>
          </div>

          <div class="email-document-body">
            ${Utils.escapeHtml(this.data.body || "")}
          </div>

          ${
            this.data.signature
              ? `
                <div class="email-document-signature">
                  ${Utils.escapeHtml(this.data.signature)}
                </div>
              `
              : ""
          }
        </section>
      </article>
    `;
  }

  renderInspector() {
    return `
      <section class="inspector-section">
        <h3 class="inspector-section-title">Document Format</h3>

        <div class="form-group">
          <label>Visual style</label>
          <select id="email-document-style" class="form-control">
            <option value="email" ${
              this.data.documentStyle === "email" ? "selected" : ""
            }>
              Email
            </option>

            <option value="memo" ${
              this.data.documentStyle === "memo" ? "selected" : ""
            }>
              Classified memo
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>Classification header</label>
          <input
            id="email-classification"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.classification || "")}"
          />
        </div>
      </section>

      <section class="inspector-section">
        <h3 class="inspector-section-title">Header Fields</h3>

        <div class="form-group">
          <label>From name</label>
          <input
            id="email-from-name"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.fromName || "")}"
          />
        </div>

        <div class="form-group">
          <label>From address</label>
          <input
            id="email-from-address"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.fromAddress || "")}"
          />
        </div>

        <div class="form-group">
          <label>To</label>
          <input
            id="email-to-address"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.toAddress || "")}"
          />
        </div>

        <div class="form-group">
          <label>Date</label>
          <input
            id="email-date"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.date || "")}"
          />
        </div>

        <div class="form-group">
          <label>Subject</label>
          <input
            id="email-subject"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.subject || "")}"
          />
        </div>
      </section>

      <section class="inspector-section">
        <h3 class="inspector-section-title">Message</h3>

        <div class="form-group">
          <label>Body</label>
          <textarea
            id="email-body"
            class="form-control"
          >${Utils.escapeHtml(this.data.body || "")}</textarea>
        </div>

        <div class="form-group">
          <label>Signature</label>
          <input
            id="email-signature"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.signature || "")}"
          />
        </div>
      </section>
    `;
  }

  bindInspectorEvents(inspectorElement) {
    const fields = [
      ["#email-document-style", "documentStyle"],
      ["#email-classification", "classification"],
      ["#email-from-name", "fromName"],
      ["#email-from-address", "fromAddress"],
      ["#email-to-address", "toAddress"],
      ["#email-date", "date"],
      ["#email-subject", "subject"],
      ["#email-body", "body"],
      ["#email-signature", "signature"],
    ];

    fields.forEach(([selector, fieldName]) => {
      const input = inspectorElement.querySelector(selector);

      const save = () => {
        this.updateData({
          [fieldName]: input.value,
        });
      };

      input?.addEventListener("input", save);
      input?.addEventListener("change", save);
    });
  }
}

/** -------------------------------------------------------------------------- */
/* social media post module */
/* -------------------------------------------------------------------------- */

class SocialMediaPostModule extends BaseModule {
  static get type() {
    return "social-media-post";
  }

  static createDefault(store) {
    const profile = store.getState().socialProfiles?.[0];

    return {
      id: Utils.uid("module"),
      type: SocialMediaPostModule.type,
      data: {
        profileId: profile?.id || "",
        content:
          "Does anyone know why the reservoir access road is blocked tonight?",
        timestamp: "10:47 PM · Oct 13, 2004",
        replies: "12",
        reposts: "4",
        likes: "31",
        imageUrl: "",
        requireImage: false,
      },
    };
  }

  getProfile() {
    const profiles = this.store.getState().socialProfiles || [];

    return (
      profiles.find((profile) => profile.id === this.data.profileId) || {
        id: "missing-profile",
        displayName: "Unknown User",
        handle: "@unknown",
        avatar: "?",
        platform: "microblog",
        ownerCharacterId: "",
        primaryColor: "#6c7c95",
        softColor: "#dfe6ef",
      }
    );
  }

  getProfileTheme(profile) {
    const owner = profile.ownerCharacterId
      ? this.store.getCharacter(profile.ownerCharacterId)
      : null;

    if (owner) {
      return CharacterTheme.getCssVariables(owner);
    }

    return [
      `--character-primary: ${profile.primaryColor || "#6c7c95"}`,
      `--character-soft: ${profile.softColor || "#dfe6ef"}`,
      `--character-ink: ${Utils.contrastTextColor(
        profile.softColor || "#dfe6ef"
      )}`,
    ].join("; ");
  }

  static PLATFORMS = {
    microblog: { label: "Microblog", stats: [["↩", "replies"], ["⇄", "reposts"], ["♥", "likes"]] },
    photo: { label: "Photo feed", stats: [["♥", "likes"], ["💬", "replies"], ["➤", "reposts"]] },
    web1: { label: "Web 1.0 profile", stats: [["Comments:", "replies"], ["Views:", "reposts"], ["Kudos:", "likes"]] },
    chat: { label: "Chat server", stats: [["💬", "replies"], ["👍", "likes"]] },
    video: { label: "Video site", stats: [["▶", "reposts"], ["👍", "likes"], ["💬", "replies"]] },
    retro: { label: "Retro social page", stats: [["Friends:", "reposts"], ["Comments:", "replies"], ["★", "likes"]] },
    comment: { label: "Comment thread", stats: [["Replies:", "replies"], ["▲", "likes"]] },
  };

  render() {
    const selectedClass =
      this.editor.selectedModuleId === this.id ? "selected" : "";

    const profile = this.getProfile();
    const profileTheme = this.getProfileTheme(profile);
    const platformKey = SocialMediaPostModule.PLATFORMS[profile.platform]
      ? profile.platform
      : "microblog";
    const platformClass = `social-platform-${platformKey}`;
    const platform = SocialMediaPostModule.PLATFORMS[platformKey];
    const statsHtml = platform.stats
      .map(
        ([icon, key]) =>
          `<span>${icon} ${Utils.escapeHtml(this.data[key] || "0")}</span>`
      )
      .join("");

    return `
      <article
        class="placed-module ${selectedClass}"
        data-module-id="${this.id}"
      >
        ${this.renderActions()}

        <section
          class="social-media-post-module ${platformClass}"
          style="${profileTheme}"
        >
          <div class="social-post-header">
            <div
              class="social-post-avatar"
              style="${profileTheme}"
            >
              ${Utils.escapeHtml(profile.avatar || "?")}
            </div>

            <div class="social-post-author">
              <strong>${Utils.escapeHtml(profile.displayName || "Unknown User")}</strong>
              <span>${Utils.escapeHtml(profile.handle || "@unknown")}</span>
            </div>

            <div class="social-post-platform-label">
              ${Utils.escapeHtml(profile.platform || "social")}
            </div>
          </div>

          <div class="social-post-content">
            ${Utils.escapeHtml(this.data.content || "")}
          </div>

          ${
            this.data.imageUrl
              ? `
                <img
                  class="social-post-image"
                  src="${Utils.escapeHtml(this.data.imageUrl)}"
                  alt="Attached social post media"
                />
              `
              : ""
          }

          <div class="social-post-timestamp">
            ${Utils.escapeHtml(this.data.timestamp || "")}
          </div>

          <div class="social-post-stats">
            ${statsHtml}
          </div>
        </section>
      </article>
    `;
  }

  renderInspector() {
    const profiles = this.store.getState().socialProfiles || [];

    const profileOptions = [
      `<option value="">No profile selected</option>`,
      ...profiles.map((profile) => {
        const selected = profile.id === this.data.profileId ? "selected" : "";

        return `
          <option value="${profile.id}" ${selected}>
            ${Utils.escapeHtml(profile.displayName)} (${Utils.escapeHtml(
              profile.handle
            )})
          </option>
        `;
      }),
    ].join("");

    return `
      <section class="inspector-section">
        <h3 class="inspector-section-title">Social Identity</h3>

        <div class="form-group">
          <label>Social profile</label>
          <select id="social-post-profile" class="form-control">
            ${profileOptions}
          </select>
        </div>

        <p class="sidebar-help">
          Create or edit shared social identities in the profile manager.
          Character colors flow into the post automatically when the profile
          has an owner character.
        </p>
      </section>

      <section class="inspector-section">
        <h3 class="inspector-section-title">Post Content</h3>

        <div class="form-group">
          <label>Post text</label>
          <textarea
            id="social-post-content"
            class="form-control"
          >${Utils.escapeHtml(this.data.content || "")}</textarea>
        </div>

        <div class="form-group">
          <label>Image URL</label>
          <input
            id="social-post-image"
            class="form-control"
            type="url"
            value="${Utils.escapeHtml(this.data.imageUrl || "")}"
          />
        </div>

        <div class="form-group">
          <label>
            <input
              id="social-post-require-image"
              type="checkbox"
              ${this.data.requireImage ? "checked" : ""}
            />
            Treat image as required evidence
          </label>
        </div>

        <div class="form-group">
          <label>Timestamp</label>
          <input
            id="social-post-timestamp"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.timestamp || "")}"
          />
        </div>

        <div class="inspector-row">
          <div class="form-group">
            <label>Replies</label>
            <input
              id="social-post-replies"
              class="form-control"
              type="text"
              value="${Utils.escapeHtml(this.data.replies || "")}"
            />
          </div>

          <div class="form-group">
            <label>Reposts</label>
            <input
              id="social-post-reposts"
              class="form-control"
              type="text"
              value="${Utils.escapeHtml(this.data.reposts || "")}"
            />
          </div>
        </div>

        <div class="form-group">
          <label>Likes</label>
          <input
            id="social-post-likes"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.likes || "")}"
          />
        </div>
      </section>
    `;
  }

  bindInspectorEvents(inspectorElement) {
    const fields = [
      ["#social-post-profile", "profileId"],
      ["#social-post-content", "content"],
      ["#social-post-image", "imageUrl"],
      ["#social-post-timestamp", "timestamp"],
      ["#social-post-replies", "replies"],
      ["#social-post-reposts", "reposts"],
      ["#social-post-likes", "likes"],
    ];

    fields.forEach(([selector, fieldName]) => {
      const input = inspectorElement.querySelector(selector);

      const save = () => {
        this.updateData({
          [fieldName]: input.value,
        });
      };

      input?.addEventListener("input", save);
      input?.addEventListener("change", save);
    });

    inspectorElement
      .querySelector("#social-post-require-image")
      ?.addEventListener("change", (event) => {
        this.updateData({ requireImage: event.target.checked });
      });
  }
}

/* ---------- */

/* voicemail/voice message */
/* ------------------------------------------ */


class VoiceMessageModule extends BaseModule {
  static get type() {
    return "voice-message";
  }

  static createDefault(store) {
    const characters = store.getState().characters;
    const phoneOwner = characters[1] || characters[0] || null;
    const caller = characters[0] || null;

    return {
      id: Utils.uid("module"),
      type: VoiceMessageModule.type,

      meta: {
        timelineDate: "",
        location: "",
        reliability: "direct",
        tags: ["phone", "audio"],
      },

      data: {
        phoneOwnerCharacterId: phoneOwner?.id || "",

        callerCharacterId: caller?.id || "",
        callerName: caller?.name || "Unknown Caller",
        phoneNumber: "(508) 555-0144",

        callId: `VM-${new Date()
          .toISOString()
          .replace(/\D/g, "")
          .slice(0, 14)}`,

        messageStatus: "new",

        receivedAt: "October 14, 2004 · 2:13 AM",
        duration: "00:37",

        audioUrl: "",
        waveformSeed: [16, 24, 39, 68, 42, 18, 81, 53, 28, 61],

        transcriptionEnabled: true,
        transcript:
          "New voice message. Edit the transcript in the inspector.",

        callbackEnabled: true,
        showPhoneNumber: true,
        showCallId: true,
      },
    };
  }

  getPhoneOwner() {
    return this.store.getCharacterOrFallback(
      this.data.phoneOwnerCharacterId
    );
  }

  getCaller() {
    if (!this.data.callerCharacterId) {
      return null;
    }

    return this.store.getCharacter(this.data.callerCharacterId);
  }

  getCallerName() {
    const caller = this.getCaller();

    return caller?.name || this.data.callerName || "Unknown Caller";
  }

  getStatusLabel() {
    const labels = {
      new: "NEW",
      played: "PLAYED",
      saved: "SAVED",
      deleted: "DELETED",
      failed: "DELIVERY FAILED",
      blocked: "BLOCKED CALLER",
    };

    return labels[this.data.messageStatus] || "VOICE MESSAGE";
  }

  renderWaveform() {
    const bars = Utils.safeArray(this.data.waveformSeed);

    return `
      <div class="voice-message-waveform" aria-hidden="true">
        ${bars
          .map((height) => {
            const normalizedHeight = Math.max(
              8,
              Math.min(100, Number(height) || 8)
            );

            return `
              <span style="height: ${normalizedHeight}%"></span>
            `;
          })
          .join("")}
      </div>
    `;
  }

  render() {
    const selectedClass =
      this.editor.selectedModuleId === this.id ? "selected" : "";

    const phoneOwner = this.getPhoneOwner();
    const caller = this.getCaller();

    const phoneStyle = CharacterTheme.getPhoneCssVariables(phoneOwner);

    const callerStyle = caller
      ? CharacterTheme.getCssVariables(caller)
      : `
        --character-primary: #7a7f8c;
        --character-soft: #e4e6eb;
        --character-ink: #171923;
      `;

    const statusClass = `voice-status-${this.data.messageStatus || "new"}`;

    return `
      <article
        class="placed-module ${selectedClass}"
        data-module-id="${this.id}"
        draggable="true"
      >
        ${this.renderActions()}

        <section
          class="voice-message-module ${statusClass}"
          style="${phoneStyle}; ${this.getStyleOverrideCss()}"
        >
          <div class="voice-message-phone-context">
            <span
              class="voice-message-owner-dot"
              style="${CharacterTheme.getCssVariables(phoneOwner)}"
            ></span>

            <span>
              ${Utils.escapeHtml(phoneOwner.name)}'s phone
            </span>

            <span class="voice-message-status-badge">
              ${Utils.escapeHtml(this.getStatusLabel())}
            </span>
          </div>

          <div class="voice-message-header">
            <div
              class="voice-message-avatar"
              style="${callerStyle}"
            >
              ${Utils.escapeHtml(
                caller?.avatar ||
                  this.getCallerName().charAt(0).toUpperCase()
              )}
            </div>

            <div class="voice-message-caller">
              <strong>${Utils.escapeHtml(this.getCallerName())}</strong>

              ${
                this.data.showPhoneNumber && this.data.phoneNumber
                  ? `
                    <span>
                      ${Utils.escapeHtml(this.data.phoneNumber)}
                    </span>
                  `
                  : ""
              }
            </div>

            <div class="voice-message-duration">
              ${Utils.escapeHtml(this.data.duration || "00:00")}
            </div>
          </div>

          <div class="voice-message-received">
            Received ${Utils.escapeHtml(this.data.receivedAt || "")}
          </div>

          <div class="voice-message-player">
            <button
              class="voice-message-play-btn"
              type="button"
              aria-label="Decorative playback button"
            >
              ▶
            </button>

            ${this.renderWaveform()}

            <span class="voice-message-play-time">
              0:00 / ${Utils.escapeHtml(this.data.duration || "00:00")}
            </span>
          </div>

          ${
            this.data.transcriptionEnabled
              ? `
                <div class="voice-message-transcript">
                  <div class="voice-message-transcript-label">
                    Automatic transcription · may be inaccurate
                  </div>

                  <p>
                    ${Utils.escapeHtml(this.data.transcript || "")}
                  </p>
                </div>
              `
              : ""
          }

          <div class="voice-message-footer">
            ${
              this.data.showCallId && this.data.callId
                ? `
                  <span>
                    Call ID: ${Utils.escapeHtml(this.data.callId)}
                  </span>
                `
                : "<span></span>"
            }

            ${
              this.data.callbackEnabled
                ? `
                  <button
                    class="voice-message-callback-btn"
                    type="button"
                    aria-label="Decorative callback control"
                  >
                    ↩ Call Back
                  </button>
                `
                : ""
            }
          </div>
        </section>
      </article>
    `;
  }

  renderInspector() {
    const characters = this.store.getState().characters;

    const characterOptions = (selectedId) => `
      <option value="">No linked character</option>
      ${characters
        .map((character) => {
          const selected =
            character.id === selectedId ? "selected" : "";

          return `
            <option value="${character.id}" ${selected}>
              ${Utils.escapeHtml(character.name)}
            </option>
          `;
        })
        .join("")}
    `;

    return `
      <section class="inspector-section">
        <h3 class="inspector-section-title">Phone Context</h3>

        <div class="form-group">
          <label>Phone owner / recipient</label>
          <select id="voice-phone-owner" class="form-control">
            ${characterOptions(this.data.phoneOwnerCharacterId)}
          </select>
        </div>

        <div class="form-group">
          <label>Message status</label>
          <select id="voice-status" class="form-control">
            <option value="new" ${
              this.data.messageStatus === "new" ? "selected" : ""
            }>
              New
            </option>

            <option value="played" ${
              this.data.messageStatus === "played" ? "selected" : ""
            }>
              Played
            </option>

            <option value="saved" ${
              this.data.messageStatus === "saved" ? "selected" : ""
            }>
              Saved
            </option>

            <option value="deleted" ${
              this.data.messageStatus === "deleted" ? "selected" : ""
            }>
              Deleted
            </option>

            <option value="failed" ${
              this.data.messageStatus === "failed" ? "selected" : ""
            }>
              Delivery failed
            </option>

            <option value="blocked" ${
              this.data.messageStatus === "blocked" ? "selected" : ""
            }>
              Blocked caller
            </option>
          </select>
        </div>
      </section>

      <section class="inspector-section">
        <h3 class="inspector-section-title">Caller</h3>

        <div class="form-group">
          <label>Linked caller character</label>
          <select id="voice-caller-character" class="form-control">
            ${characterOptions(this.data.callerCharacterId)}
          </select>
        </div>

        <div class="inspector-row">
          <div class="form-group">
            <label>Caller display name</label>
            <input
              id="voice-caller-name"
              class="form-control"
              type="text"
              value="${Utils.escapeHtml(this.data.callerName || "")}"
            />
          </div>

          <div class="form-group">
            <label>Phone number</label>
            <input
              id="voice-phone-number"
              class="form-control"
              type="text"
              value="${Utils.escapeHtml(this.data.phoneNumber || "")}"
            />
          </div>
        </div>

        <div class="form-group">
          <label>Received time</label>
          <input
            id="voice-received-at"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.receivedAt || "")}"
          />
        </div>
      </section>

      <section class="inspector-section">
        <h3 class="inspector-section-title">Recording</h3>

        <div class="inspector-row">
          <div class="form-group">
            <label>Duration</label>
            <input
              id="voice-duration"
              class="form-control"
              type="text"
              value="${Utils.escapeHtml(this.data.duration || "")}"
            />
          </div>

          <div class="form-group">
            <label>Call / message ID</label>
            <input
              id="voice-call-id"
              class="form-control"
              type="text"
              value="${Utils.escapeHtml(this.data.callId || "")}"
            />
          </div>
        </div>

        <div class="form-group">
          <label>Audio URL (optional)</label>
          <input
            id="voice-audio-url"
            class="form-control"
            type="url"
            value="${Utils.escapeHtml(this.data.audioUrl || "")}"
            placeholder="https://example.com/recording.mp3"
          />
        </div>

        <div class="form-group">
          <label>Waveform heights, comma separated</label>
          <input
            id="voice-waveform"
            class="form-control"
            type="text"
            value="${Utils.safeArray(this.data.waveformSeed).join(", ")}"
          />
        </div>
      </section>

      <section class="inspector-section">
        <h3 class="inspector-section-title">Transcription</h3>

        <div class="form-group">
          <label>
            <input
              id="voice-transcription-enabled"
              type="checkbox"
              ${this.data.transcriptionEnabled ? "checked" : ""}
            />
            Display transcription
          </label>
        </div>

        <div class="form-group">
          <label>Transcript text</label>
          <textarea
            id="voice-transcript"
            class="form-control"
          >${Utils.escapeHtml(this.data.transcript || "")}</textarea>
        </div>

        <div class="form-group">
          <label>
            <input
              id="voice-show-phone-number"
              type="checkbox"
              ${this.data.showPhoneNumber ? "checked" : ""}
            />
            Show phone number
          </label>
        </div>

        <div class="form-group">
          <label>
            <input
              id="voice-show-call-id"
              type="checkbox"
              ${this.data.showCallId ? "checked" : ""}
            />
            Show call ID
          </label>
        </div>

        <div class="form-group">
          <label>
            <input
              id="voice-callback-enabled"
              type="checkbox"
              ${this.data.callbackEnabled ? "checked" : ""}
            />
            Show callback control
          </label>
        </div>
      </section>
    `;
  }

  bindInspectorEvents(inspectorElement) {
    const fields = [
      ["#voice-phone-owner", "phoneOwnerCharacterId"],
      ["#voice-status", "messageStatus"],
      ["#voice-caller-character", "callerCharacterId"],
      ["#voice-caller-name", "callerName"],
      ["#voice-phone-number", "phoneNumber"],
      ["#voice-received-at", "receivedAt"],
      ["#voice-duration", "duration"],
      ["#voice-call-id", "callId"],
      ["#voice-audio-url", "audioUrl"],
      ["#voice-transcript", "transcript"],
    ];

    fields.forEach(([selector, fieldName]) => {
      const input = inspectorElement.querySelector(selector);

      if (!input) {
        return;
      }

      const save = () => {
        this.updateData({
          [fieldName]: input.value,
        });
      };

      input.addEventListener("input", save);
      input.addEventListener("change", save);
    });

    const waveformInput = inspectorElement.querySelector("#voice-waveform");

    waveformInput?.addEventListener("input", () => {
      const waveformSeed = waveformInput.value
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value))
        .map((value) => Math.max(8, Math.min(100, value)));

      this.updateData({ waveformSeed });
    });

    const checkboxFields = [
      ["#voice-transcription-enabled", "transcriptionEnabled"],
      ["#voice-show-phone-number", "showPhoneNumber"],
      ["#voice-show-call-id", "showCallId"],
      ["#voice-callback-enabled", "callbackEnabled"],
    ];

    checkboxFields.forEach(([selector, fieldName]) => {
      const input = inspectorElement.querySelector(selector);

      input?.addEventListener("change", () => {
        this.updateData({
          [fieldName]: input.checked,
        });
      });
    });
  }
}



/* -------------------------------------------------------------------------- */
/* transcript module */
/* -------------------------------------------------------------------------- */
class TranscriptModule extends BaseModule {
  static get type() {
    return "transcript";
  }

  static createDefault(store) {
    const caller = store.getState().characters[0];

    return {
      id: Utils.uid("module"),
      type: TranscriptModule.type,
      data: {
        transcriptType: "voicemail",
        title: "New Voicemail",
        sourceCharacterId: caller?.id || "",
        sourceName: caller?.name || "Unknown Caller",
        sourceDetail: "(508) 555-0144",
        timestamp: "October 14, 2004 · 2:13 AM",
        duration: "00:37",
        showWaveform: true,
        transcript:
          "Ashley, do not go back to the reservoir. I know you saw this message. Please call me before you do anything else.",
        speakers: [
          {
            id: Utils.uid("speaker"),
            label: "Caller",
            characterId: caller?.id || "",
            text:
              "Ashley, do not go back to the reservoir. I know you saw this message.",
          },
        ],
        waveformSeed: [18, 39, 26, 54, 33, 72, 26, 43, 58, 31, 66, 23, 46],
      },
    };
  }

  getSourceCharacter() {
    return this.data.sourceCharacterId
      ? this.store.getCharacter(this.data.sourceCharacterId)
      : null;
  }

  getTranscriptLabel() {
    const labels = {
      voicemail: "VOICEMAIL",
      police_interview: "RECORDED POLICE INTERVIEW",
      podcast: "PODCAST TRANSCRIPT",
      radio: "RADIO BROADCAST",
      hearing: "HEARING TRANSCRIPT",
      ai_chat: "ARCHIVED AI CONVERSATION",
      audio_log: "AUDIO LOG",
    };

    return labels[this.data.transcriptType] || "TRANSCRIPT";
  }

  getTranscriptStyleClass() {
    const styles = {
      voicemail: "transcript-style-voicemail",
      police_interview: "transcript-style-police",
      podcast: "transcript-style-podcast",
      radio: "transcript-style-radio",
      hearing: "transcript-style-hearing",
      ai_chat: "transcript-style-ai",
      audio_log: "transcript-style-audio",
    };

    return styles[this.data.transcriptType] || "transcript-style-voicemail";
  }

  renderWaveform() {
    if (!this.data.showWaveform) {
      return "";
    }

    const bars = Utils.safeArray(this.data.waveformSeed);

    return `
      <div class="transcript-waveform">
        ${bars
          .map(
            (height) => `
              <span style="height: ${Math.max(
                8,
                Math.min(100, Number(height))
              )}%"></span>
            `
          )
          .join("")}
      </div>
    `;
  }

  renderSpeakerLines() {
    const speakers = Utils.safeArray(this.data.speakers);

    if (!speakers.length) {
      return `
        <div class="transcript-freeform">
          ${Utils.escapeHtml(this.data.transcript || "")}
        </div>
      `;
    }

    return `
      <div class="transcript-speaker-lines">
        ${speakers
          .map((speaker) => {
            const character = speaker.characterId
              ? this.store.getCharacter(speaker.characterId)
              : null;

            const style = character
              ? CharacterTheme.getBubbleCssVariables(character)
              : "";

            return `
              <div
                class="transcript-speaker-line"
                style="${style}"
              >
                <strong>
                  ${Utils.escapeHtml(
                    speaker.label ||
                      character?.name ||
                      "Unknown Speaker"
                  )}
                </strong>

                <span>${Utils.escapeHtml(speaker.text || "")}</span>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  render() {
    const selectedClass =
      this.editor.selectedModuleId === this.id ? "selected" : "";

    const sourceCharacter = this.getSourceCharacter();

    const sourceName =
      sourceCharacter?.name ||
      this.data.sourceName ||
      "Unknown Source";

    const sourceStyle = sourceCharacter
      ? CharacterTheme.getCssVariables(sourceCharacter)
      : "";

    return `
      <article
        class="placed-module ${selectedClass}"
        data-module-id="${this.id}"
        draggable="true"
      >
        ${this.renderActions()}

        <section
          class="transcript-module ${this.getTranscriptStyleClass()}"
          style="${sourceStyle}"
        >
          <div class="transcript-type-label">
            ${Utils.escapeHtml(this.getTranscriptLabel())}
          </div>

          <div class="transcript-header">
            <div
              class="transcript-avatar"
              style="${sourceStyle}"
            >
              ${Utils.escapeHtml(
                sourceCharacter?.avatar ||
                  sourceName.charAt(0).toUpperCase()
              )}
            </div>

            <div>
              <div class="transcript-title">
                ${Utils.escapeHtml(this.data.title || "Transcript")}
              </div>

              <div class="transcript-source-detail">
                ${Utils.escapeHtml(sourceName)}
                ${
                  this.data.sourceDetail
                    ? ` · ${Utils.escapeHtml(this.data.sourceDetail)}`
                    : ""
                }
              </div>
            </div>

            <div class="transcript-duration">
              ${Utils.escapeHtml(this.data.duration || "")}
            </div>
          </div>

          <div class="transcript-player">
            <span
              class="transcript-play-button"
              aria-hidden="true"
            >
              ▶
            </span>

            ${this.renderWaveform()}
          </div>

          <dl class="transcript-meta">
            ${[
              ["Recorded", this.data.timestamp],
              ["Source", sourceName],
              ["Length", this.data.duration],
              ["Format", this.getTranscriptLabel()],
            ]
              .filter(([, value]) => value)
              .map(
                ([label, value]) => `
                  <div>
                    <dt>${label}</dt>
                    <dd>${Utils.escapeHtml(value)}</dd>
                  </div>`
              )
              .join("")}
          </dl>

          <div class="transcript-content">
            ${this.renderSpeakerLines()}
          </div>
        </section>
      </article>
    `;
  }

  renderInspector() {
    const characters = this.store.getState().characters;

    const characterOptions = (selectedId) => `
      <option value="">No linked character</option>
      ${characters
        .map((character) => {
          const selected = character.id === selectedId ? "selected" : "";

          return `
            <option value="${character.id}" ${selected}>
              ${Utils.escapeHtml(character.name)}
            </option>
          `;
        })
        .join("")}
    `;

    const speakerEditors = Utils.safeArray(this.data.speakers)
      .map(
        (speaker, index) => `
          <article
            class="message-editor-card"
            data-transcript-speaker-id="${speaker.id}"
          >
            <div class="message-editor-topline">
              <span class="message-editor-label">
                Speaker ${index + 1}
              </span>

              <div class="message-editor-actions">
                <button
                  type="button"
                  class="delete"
                  data-transcript-speaker-action="delete"
                >
                  ×
                </button>
              </div>
            </div>

            <div class="inspector-row">
              <div class="form-group">
                <label>Speaker label</label>
                <input
                  class="form-control"
                  type="text"
                  value="${Utils.escapeHtml(speaker.label || "")}"
                  data-transcript-speaker-field="label"
                />
              </div>

              <div class="form-group">
                <label>Character link</label>
                <select
                  class="form-control"
                  data-transcript-speaker-field="characterId"
                >
                  ${characterOptions(speaker.characterId)}
                </select>
              </div>
            </div>

            <div class="form-group">
              <label>Spoken text</label>
              <textarea
                class="form-control"
                data-transcript-speaker-field="text"
              >${Utils.escapeHtml(speaker.text || "")}</textarea>
            </div>
          </article>
        `
      )
      .join("");

    return `
      <section class="inspector-section">
        <h3 class="inspector-section-title">Transcript Format</h3>

        <div class="form-group">
          <label>Transcript type</label>
          <select id="transcript-type" class="form-control">
            <option value="voicemail" ${
              this.data.transcriptType === "voicemail" ? "selected" : ""
            }>
              Voicemail
            </option>

            <option value="police_interview" ${
              this.data.transcriptType === "police_interview"
                ? "selected"
                : ""
            }>
              Police interview
            </option>

            <option value="podcast" ${
              this.data.transcriptType === "podcast" ? "selected" : ""
            }>
              Podcast
            </option>

            <option value="radio" ${
              this.data.transcriptType === "radio" ? "selected" : ""
            }>
              Radio broadcast
            </option>

            <option value="hearing" ${
              this.data.transcriptType === "hearing" ? "selected" : ""
            }>
              Hearing / deposition
            </option>

            <option value="ai_chat" ${
              this.data.transcriptType === "ai_chat" ? "selected" : ""
            }>
              AI chat log
            </option>

            <option value="audio_log" ${
              this.data.transcriptType === "audio_log" ? "selected" : ""
            }>
              General audio log
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>Title</label>
          <input
            id="transcript-title"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.title || "")}"
          />
        </div>
      </section>

      <section class="inspector-section">
        <h3 class="inspector-section-title">Source Metadata</h3>

        <div class="form-group">
          <label>Linked source character</label>
          <select id="transcript-source-character" class="form-control">
            ${characterOptions(this.data.sourceCharacterId)}
          </select>
        </div>

        <div class="inspector-row">
          <div class="form-group">
            <label>Source display name</label>
            <input
              id="transcript-source-name"
              class="form-control"
              type="text"
              value="${Utils.escapeHtml(this.data.sourceName || "")}"
            />
          </div>

          <div class="form-group">
            <label>Source detail</label>
            <input
              id="transcript-source-detail"
              class="form-control"
              type="text"
              value="${Utils.escapeHtml(this.data.sourceDetail || "")}"
              placeholder="Phone number, station, episode"
            />
          </div>
        </div>

        <div class="inspector-row">
          <div class="form-group">
            <label>Timestamp</label>
            <input
              id="transcript-timestamp"
              class="form-control"
              type="text"
              value="${Utils.escapeHtml(this.data.timestamp || "")}"
            />
          </div>

          <div class="form-group">
            <label>Duration</label>
            <input
              id="transcript-duration"
              class="form-control"
              type="text"
              value="${Utils.escapeHtml(this.data.duration || "")}"
            />
          </div>
        </div>

        <div class="form-group">
          <label>
            <input
              id="transcript-show-waveform"
              type="checkbox"
              ${this.data.showWaveform ? "checked" : ""}
            />
            Show waveform
          </label>
        </div>
      </section>

      <section class="inspector-section">
        <h3 class="inspector-section-title">Transcript Lines</h3>

        <div id="transcript-speaker-list" class="message-editor-list">
          ${speakerEditors}
        </div>

        <button
          id="add-transcript-speaker-btn"
          type="button"
          class="btn btn-secondary add-message-btn"
        >
          + Add Speaker Line
        </button>

        <div class="form-group mt-6">
          <label>Fallback freeform transcript</label>
          <textarea
            id="transcript-freeform-text"
            class="form-control"
          >${Utils.escapeHtml(this.data.transcript || "")}</textarea>
        </div>
      </section>
    `;
  }

  bindInspectorEvents(inspectorElement) {
    const fields = [
      ["#transcript-type", "transcriptType"],
      ["#transcript-title", "title"],
      ["#transcript-source-character", "sourceCharacterId"],
      ["#transcript-source-name", "sourceName"],
      ["#transcript-source-detail", "sourceDetail"],
      ["#transcript-timestamp", "timestamp"],
      ["#transcript-duration", "duration"],
      ["#transcript-freeform-text", "transcript"],
    ];

    fields.forEach(([selector, fieldName]) => {
      const input = inspectorElement.querySelector(selector);

      const save = () => {
        this.updateData({
          [fieldName]: input.value,
        });
      };

      input?.addEventListener("input", save);
      input?.addEventListener("change", save);
    });

    const showWaveform = inspectorElement.querySelector(
      "#transcript-show-waveform"
    );

    showWaveform?.addEventListener("change", () => {
      this.updateData({
        showWaveform: showWaveform.checked,
      });
    });

    inspectorElement
      .querySelector("#add-transcript-speaker-btn")
      ?.addEventListener("click", () => {
        const speakers = Utils.clone(Utils.safeArray(this.data.speakers));

        speakers.push({
          id: Utils.uid("speaker"),
          label: "New Speaker",
          characterId: "",
          text: "New transcript line.",
        });

        this.updateData({ speakers });
      });

    inspectorElement
      .querySelectorAll("[data-transcript-speaker-id]")
      .forEach((card) => {
        const speakerId = card.dataset.transcriptSpeakerId;

        card
          .querySelectorAll("[data-transcript-speaker-field]")
          .forEach((input) => {
            const save = () => {
              const speakers = Utils.clone(
                Utils.safeArray(this.data.speakers)
              );

              const speaker = speakers.find(
                (item) => item.id === speakerId
              );

              if (!speaker) {
                return;
              }

              speaker[input.dataset.transcriptSpeakerField] = input.value;

              this.updateData({ speakers });
            };

            input.addEventListener("input", save);
            input.addEventListener("change", save);
          });

        card
          .querySelectorAll("[data-transcript-speaker-action]")
          .forEach((button) => {
            button.addEventListener("click", () => {
              if (
                button.dataset.transcriptSpeakerAction !== "delete"
              ) {
                return;
              }

              const speakers = Utils.safeArray(this.data.speakers).filter(
                (speaker) => speaker.id !== speakerId
              );

              this.updateData({ speakers });
            });
          });
      });
  }
}


/* -------------------------------------------------------------------------- */
/* newspaper module */
/* -------------------------------------------------------------------------- */

/* Pure DOM focus logic; also stringified into the standalone export. */
function newspaperToggleStoryFocus(section, key) {
  const mode = section.dataset.focusMode || "main";
  const base = section.dataset.focusBase || "main";
  const stories = Array.prototype.slice.call(
    section.querySelectorAll("[data-story-key]")
  );
  const current = () => section.dataset.focusOverride || base;
  const baseDim = (k) =>
    mode === "main" ? k !== "main" : mode === "surrounding" ? k === "main" : false;

  if (mode === "one") {
    if (key === current()) return;
    section.dataset.focusOverride = key;
  } else if (baseDim(key)) {
    const target = stories.filter((el) => el.dataset.storyKey === key);
    const reveal = !target[0].classList.contains("is-revealed");
    target.forEach((el) => el.classList.toggle("is-revealed", reveal));
  } else {
    return;
  }

  stories.forEach((el) => {
    const k = el.dataset.storyKey;
    const dim =
      mode === "one"
        ? k !== current()
        : baseDim(k) && !el.classList.contains("is-revealed");
    el.classList.toggle("is-dimmed", dim);
    el.setAttribute("aria-pressed", dim ? "false" : "true");
  });
}

class NewspaperArticleModule extends BaseModule {
  static focusState = new Map();

  static get type() {
    return "newspaper-article";
  }

  static createDefault(store) {
    const publication = store.getState().newspaperProfiles?.[0];

    return {
      id: Utils.uid("module"),
      type: NewspaperArticleModule.type,
      data: {
        publicationId: publication?.id || "",
        section: "LOCAL NEWS",
        headline: "Unexplained Lights Reported Over Blackwater Reservoir",
        byline: "By M. Carter, Staff Reporter",
        date: "October 15, 2004",
        body:
          "Residents near Blackwater Reservoir reported seeing several unexplained lights above the water late Thursday night.\n\nAuthorities declined to comment on whether the reports are connected to a temporary closure of the south access road.",
        focusMode: "focus-main",
        surroundingArticles: [
          {
            id: Utils.uid("article"),
            headline: "Town council debates late-night curfew proposal",
            teaser: "Residents will vote next Tuesday.",
          },
          {
            id: Utils.uid("article"),
            headline: "High school football team advances to regional final",
            teaser: "The Wildcats won 21–17.",
          },
        ],
      },
    };
  }

  getPublication() {
    const profiles = this.store.getState().newspaperProfiles || [];

    return (
      profiles.find((profile) => profile.id === this.data.publicationId) || {
        id: "missing-publication",
        name: "The Local Gazette",
        style: "broadsheet",
        mastheadColor: "#1b1b1b",
        accentColor: "#8d1f1f",
        showAds: false,
      }
    );
  }

  bindCanvasEvents(container) {
    const toggle = (story) => {
      const section = story.closest(".newspaper-article-module");
      if (!section || section.dataset.focusMode === "all") return;

      newspaperToggleStoryFocus(section, story.dataset.storyKey);

      NewspaperArticleModule.focusState.set(this.id, {
        override: section.dataset.focusOverride || "",
        revealed: Array.from(
          new Set(
            Array.from(section.querySelectorAll(".is-revealed")).map(
              (el) => el.dataset.storyKey
            )
          )
        ),
      });
    };

    container.addEventListener("click", (event) => {
      const story = event.target.closest(".newspaper-story[data-story-key]");
      if (story) toggle(story);
    });

    container.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const story = event.target.closest(".newspaper-story[data-story-key]");
      if (story && story === event.target) {
        event.preventDefault();
        toggle(story);
      }
    });

    super.bindCanvasEvents(container);
  }

  getFocusMode() {
    return String(this.data.focusMode || "focus-main").replace(/^focus-/, "");
  }

  getStoryFocusAttrs(key) {
    const mode = this.getFocusMode();
    const state = NewspaperArticleModule.focusState.get(this.id) || {
      override: "",
      revealed: [],
    };
    const current = state.override || this.data.focusedStoryKey || "main";
    const revealed = state.revealed.includes(key);
    let dim = false;

    if (mode === "main") dim = key !== "main" && !revealed;
    else if (mode === "surrounding") dim = key === "main" && !revealed;
    else if (mode === "one") dim = key !== current;

    const toggleAttrs =
      mode === "all"
        ? ""
        : `tabindex="0" role="button" aria-pressed="${dim ? "false" : "true"}"`;

    return {
      attrs: `data-story-key="${Utils.escapeHtml(key)}" ${toggleAttrs}`,
      cls: `${dim ? " is-dimmed" : ""}${revealed ? " is-revealed" : ""}`,
    };
  }

  renderSurroundingArticle(article) {
    const { attrs, cls } = this.getStoryFocusAttrs(article.id);

    return `
      <article draggable="true" class="newspaper-surrounding-story newspaper-story${cls}" ${attrs}>
        <h4>${Utils.escapeHtml(article.headline || "")}</h4>
        <p>${Utils.escapeHtml(article.teaser || "")}</p>
      </article>
    `;
  }

  static AD_STYLES = {
    boxed: "Boxed",
    banner: "Bold banner",
    inverse: "Inverted",
    vintage: "Vintage double rule",
    coupon: "Coupon (dashed)",
    classified: "Classified",
  };

  createAd(overrides = {}) {
    return {
      id: Utils.uid("ad"),
      label: "ADVERTISEMENT",
      headline: "BLACKWATER AUTO",
      text: "Reliable repairs. Honest prices.",
      side: "left",
      style: "boxed",
      ...overrides,
    };
  }

  /* Modules without an explicit ads list fall back to the publication default ad. */
  getAds() {
    if (Array.isArray(this.data.ads)) {
      return this.data.ads;
    }

    return this.getPublication().showAds ? [this.createAd({ id: "default-ad" })] : [];
  }

  renderAd(ad) {
    const style = NewspaperArticleModule.AD_STYLES[ad.style] ? ad.style : "boxed";

    const { attrs, cls } = this.getStoryFocusAttrs(`ad:${ad.id}`);

    return `
      <aside class="newspaper-ad newspaper-ad-${style} newspaper-story${cls}" ${attrs}>
        ${ad.label ? `<div>${Utils.escapeHtml(ad.label)}</div>` : ""}
        <strong>${Utils.escapeHtml(ad.headline || "")}</strong>
        <span>${Utils.escapeHtml(ad.text || "")}</span>
      </aside>
    `;
  }

  renderAds(side) {
    return this.getAds()
      .filter((ad) => (ad.side === "right" ? "right" : "left") === side)
      .map((ad) => this.renderAd(ad))
      .join("");
  }

  render() {
    const selectedClass =
      this.editor.selectedModuleId === this.id ? "selected" : "";

    const publication = this.getPublication();
    const profileStyle = [
      `--newspaper-masthead: ${publication.mastheadColor || "#1b1b1b"}`,
      `--newspaper-accent: ${publication.accentColor || "#8d1f1f"}`,
    ].join("; ");

    const styleClass = `newspaper-style-${publication.style || "broadsheet"}`;
    const focusMode = this.getFocusMode();
    const focusClass = `newspaper-focus-${focusMode}`;
    const focusState = NewspaperArticleModule.focusState.get(this.id);
    const mainFocus = this.getStoryFocusAttrs("main");

    return `
      <article
        class="placed-module ${selectedClass}"
        data-module-id="${this.id}"
      >
        ${this.renderActions()}

        <section
          class="newspaper-article-module ${styleClass} ${focusClass}"
          data-focus-mode="${focusMode}"
          data-focus-base="${Utils.escapeHtml(this.data.focusedStoryKey || "main")}"
          data-focus-override="${Utils.escapeHtml(focusState?.override || "")}"
          style="${profileStyle}"
        >
          <header class="newspaper-masthead">
            <div class="newspaper-name">
              ${Utils.escapeHtml(publication.name || "The Local Gazette")}
            </div>

            <div class="newspaper-date-line">
              ${Utils.escapeHtml(this.data.date || "")}
            </div>
          </header>

          <div class="newspaper-layout">
            <aside class="newspaper-side-column">
              ${Utils.safeArray(this.data.surroundingArticles)
                .map((article) => this.renderSurroundingArticle(article))
                .join("")}

              ${this.renderAds("left")}
            </aside>

            <main
              class="newspaper-main-story newspaper-story${mainFocus.cls}"
              ${mainFocus.attrs}
              aria-label="Main article"
            >
              <div class="newspaper-section">
                ${Utils.escapeHtml(this.data.section || "")}
              </div>

              <h2>${Utils.escapeHtml(this.data.headline || "")}</h2>

              <div class="newspaper-byline">
                ${Utils.escapeHtml(this.data.byline || "")}
              </div>

              <div class="newspaper-article-body">
                ${Utils.escapeHtml(this.data.body || "")}
              </div>
            </main>

            <aside class="newspaper-side-column newspaper-side-column-right">
              ${this.renderAds("right")}

              ${Utils.safeArray(this.data.surroundingArticles)
                .slice()
                .reverse()
                .map((article) => this.renderSurroundingArticle(article))
                .join("")}
            </aside>
          </div>
        </section>
      </article>
    `;
  }

  renderInspector() {
    const publications = this.store.getState().newspaperProfiles || [];

    const publicationOptions = [
      `<option value="">No publication selected</option>`,
      ...publications.map((publication) => {
        const selected =
          publication.id === this.data.publicationId ? "selected" : "";

        return `
          <option value="${publication.id}" ${selected}>
            ${Utils.escapeHtml(publication.name)}
          </option>
        `;
      }),
    ].join("");

    const surroundingArticles = Utils.safeArray(this.data.surroundingArticles)
      .map((article, index) => {
        return `
          <article
            class="message-editor-card"
            data-surrounding-article-id="${article.id}"
          >
            <div class="message-editor-topline">
              <span class="message-editor-label">
                Surrounding Article ${index + 1}
              </span>

              <div class="message-editor-actions">
                <button
                  type="button"
                  class="delete"
                  data-surrounding-article-action="delete"
                >
                  ×
                </button>
              </div>
            </div>

            <div class="form-group">
              <label>Headline</label>
              <input
                class="form-control"
                type="text"
                value="${Utils.escapeHtml(article.headline || "")}"
                data-surrounding-article-field="headline"
              />
            </div>

            <div class="form-group">
              <label>Teaser</label>
              <textarea
                class="form-control"
                data-surrounding-article-field="teaser"
              >${Utils.escapeHtml(article.teaser || "")}</textarea>
            </div>
          </article>
        `;
      })
      .join("");

    const adStyleOptions = (current) =>
      Object.entries(NewspaperArticleModule.AD_STYLES)
        .map(([value, label]) => `<option value="${value}" ${value === current ? "selected" : ""}>${label}</option>`)
        .join("");

    const adCards = this.getAds()
      .map((ad, index) => `
        <article class="message-editor-card" data-ad-id="${Utils.escapeHtml(ad.id)}">
          <div class="message-editor-topline">
            <span class="message-editor-label">Advertisement ${index + 1}</span>
            <div class="message-editor-actions">
              <button type="button" class="delete" data-ad-action="delete" aria-label="Delete advertisement">×</button>
            </div>
          </div>
          <div class="form-group">
            <label>Small label (blank to hide)</label>
            <input class="form-control" type="text" value="${Utils.escapeHtml(ad.label || "")}" data-ad-field="label" />
          </div>
          <div class="form-group">
            <label>Advertiser / headline</label>
            <input class="form-control" type="text" value="${Utils.escapeHtml(ad.headline || "")}" data-ad-field="headline" />
          </div>
          <div class="form-group">
            <label>Ad text</label>
            <textarea class="form-control" data-ad-field="text">${Utils.escapeHtml(ad.text || "")}</textarea>
          </div>
          <div class="form-group">
            <label>Appearance</label>
            <select class="form-control" data-ad-field="style">${adStyleOptions(ad.style)}</select>
          </div>
          <div class="form-group">
            <label>Column</label>
            <select class="form-control" data-ad-field="side">
              <option value="left" ${ad.side !== "right" ? "selected" : ""}>Left column</option>
              <option value="right" ${ad.side === "right" ? "selected" : ""}>Right column</option>
            </select>
          </div>
        </article>
      `)
      .join("");

    return `
      <section class="inspector-section">
        <h3 class="inspector-section-title">Publication</h3>

        <div class="form-group">
          <label>Newspaper profile</label>
          <select id="newspaper-publication" class="form-control">
            ${publicationOptions}
          </select>
        </div>

        <p class="sidebar-help">
          Manage publication styles, colors, ads, and era presets from the
          newspaper profile manager.
        </p>

        <div class="form-group">
          <label>Focus mode</label>
          <select id="newspaper-focus-mode" class="form-control">
            <option value="focus-main" ${
              this.data.focusMode === "focus-main" ? "selected" : ""
            }>
              Focus main article
            </option>

            <option value="focus-one" ${
              this.data.focusMode === "focus-one" ? "selected" : ""
            }>
              Focus one story (click another to move focus)
            </option>

            <option value="focus-all" ${
              this.data.focusMode === "focus-all" ? "selected" : ""
            }>
              Show all stories equally
            </option>

            <option value="focus-surrounding" ${
              this.data.focusMode === "focus-surrounding" ? "selected" : ""
            }>
              Focus surrounding stories
            </option>
          </select>
        </div>
      </section>

      <section class="inspector-section">
        <h3 class="inspector-section-title">Main Article</h3>

        <div class="form-group">
          <label>Section</label>
          <input
            id="newspaper-section"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.section || "")}"
          />
        </div>

        <div class="form-group">
          <label>Headline</label>
          <input
            id="newspaper-headline"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.headline || "")}"
          />
        </div>

        <div class="form-group">
          <label>Byline</label>
          <input
            id="newspaper-byline"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.byline || "")}"
          />
        </div>

        <div class="form-group">
          <label>Date</label>
          <input
            id="newspaper-date"
            class="form-control"
            type="text"
            value="${Utils.escapeHtml(this.data.date || "")}"
          />
        </div>

        <div class="form-group">
          <label>Article text</label>
          <textarea
            id="newspaper-body"
            class="form-control"
          >${Utils.escapeHtml(this.data.body || "")}</textarea>
        </div>
      </section>

      <section class="inspector-section">
        <h3 class="inspector-section-title">Advertisements</h3>

        <div id="newspaper-ad-list" class="message-editor-list">
          ${adCards || `<p class="sidebar-help">No advertisements in this article.</p>`}
        </div>

        <button id="add-newspaper-ad" type="button" class="btn btn-secondary add-message-btn">
          + Add Advertisement
        </button>
      </section>

      <section class="inspector-section">
        <h3 class="inspector-section-title">Surrounding Stories</h3>

        <div id="surrounding-article-list" class="message-editor-list">
          ${surroundingArticles}
        </div>

        <button
          id="add-surrounding-article"
          type="button"
          class="btn btn-secondary add-message-btn"
        >
          + Add Surrounding Story
        </button>
      </section>
    `;
  }

  bindInspectorEvents(inspectorElement) {
    const articleFields = [
      ["#newspaper-publication", "publicationId"],
      ["#newspaper-focus-mode", "focusMode"],
      ["#newspaper-section", "section"],
      ["#newspaper-headline", "headline"],
      ["#newspaper-byline", "byline"],
      ["#newspaper-date", "date"],
      ["#newspaper-body", "body"],
    ];

    articleFields.forEach(([selector, fieldName]) => {
      const input = inspectorElement.querySelector(selector);

      const save = () => {
        this.updateData({
          [fieldName]: input.value,
        });
      };

      input?.addEventListener("input", save);
      input?.addEventListener("change", save);
    });

    inspectorElement.querySelector("#add-newspaper-ad")?.addEventListener("click", () => {
      const ads = Utils.clone(this.getAds());
      ads.push(this.createAd({ id: Utils.uid("ad"), headline: "NEW ADVERTISER", text: "Write your ad copy here.", side: ads.length % 2 ? "right" : "left" }));
      this.updateData({ ads });
    });

    inspectorElement.querySelectorAll("[data-ad-id]").forEach((card) => {
      const adId = card.dataset.adId;

      card.querySelectorAll("[data-ad-field]").forEach((input) => {
        const save = () => {
          const ads = Utils.clone(this.getAds());
          const ad = ads.find((item) => item.id === adId);
          if (!ad) return;
          ad[input.dataset.adField] = input.value;
          this.updateData({ ads });
        };
        input.addEventListener("input", save);
        input.addEventListener("change", save);
      });

      card.querySelector("[data-ad-action=delete]")?.addEventListener("click", () => {
        this.updateData({ ads: this.getAds().filter((item) => item.id !== adId) });
      });
    });

    const addButton = inspectorElement.querySelector(
      "#add-surrounding-article"
    );

    addButton?.addEventListener("click", () => {
      const surroundingArticles = Utils.clone(
        Utils.safeArray(this.data.surroundingArticles)
      );

      surroundingArticles.push({
        id: Utils.uid("article"),
        headline: "New local story",
        teaser: "Add a short teaser here.",
      });

      this.updateData({ surroundingArticles });
    });

    inspectorElement
      .querySelectorAll("[data-surrounding-article-id]")
      .forEach((articleCard) => {
        const articleId = articleCard.dataset.surroundingArticleId;

        articleCard
          .querySelectorAll("[data-surrounding-article-field]")
          .forEach((input) => {
            const save = () => {
              const surroundingArticles = Utils.clone(
                Utils.safeArray(this.data.surroundingArticles)
              );

              const article = surroundingArticles.find(
                (item) => item.id === articleId
              );

              if (!article) {
                return;
              }

              article[input.dataset.surroundingArticleField] = input.value;

              this.updateData({ surroundingArticles });
            };

            input.addEventListener("input", save);
            input.addEventListener("change", save);
          });

        articleCard
          .querySelectorAll("[data-surrounding-article-action]")
          .forEach((button) => {
            button.addEventListener("click", () => {
              const action = button.dataset.surroundingArticleAction;

              if (action !== "delete") {
                return;
              }

              const surroundingArticles = Utils.clone(
                Utils.safeArray(this.data.surroundingArticles)
              ).filter((article) => article.id !== articleId);

              this.updateData({ surroundingArticles });
            });
          });
      });
  }
}


/* -------------------------------------------------------------------------- */
/* END MODULE DEFINITIONS */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* unsupported module type handler */
/* -------------------------------------------------------------------------- */
/* UNSUPPORTED MODULE DEFINITION                                               */
/* -------------------------------------------------------------------------- */
class UnsupportedModule extends BaseModule {
  render() {
    const selectedClass =
      this.editor.selectedModuleId === this.id ? "selected" : "";

    return `
      <article
        class="placed-module ${selectedClass}"
        data-module-id="${this.id}"
      >
        ${this.renderActions()}

        <section class="unsupported-module">
          <div class="unsupported-module-icon">!</div>

          <div>
            <strong>Unsupported module type</strong>
            <p>
              The project contains
              <code>${Utils.escapeHtml(this.type)}</code>,
              but no renderer is currently registered.
            </p>
          </div>
        </section>
      </article>
    `;
  }

  renderInspector() {
    return `
      <section class="inspector-section">
        <h3 class="inspector-section-title">Unsupported Module</h3>

        <p class="sidebar-help">
          This project references the module type
          <code>${Utils.escapeHtml(this.type)}</code>.
          Add and register its module class before editing it.
        </p>
      </section>
    `;
  }
}

/* -------------------------------------------------------------------------- */
/* MODULE REGISTRY                                                             */
/* -------------------------------------------------------------------------- */
class ModuleRegistry {
  constructor() {
    this.modules = new Map();
  }

  register(ModuleClass) {
    if (!ModuleClass) {
      throw new Error(
        "[ModuleRegistry] Cannot register an undefined module class."
      );
    }

    const type = ModuleClass.type;

    if (!type || typeof type !== "string") {
      throw new Error(
        `[ModuleRegistry] "${ModuleClass.name}" must provide a static type string.`
      );
    }

    if (typeof ModuleClass.createDefault !== "function") {
      throw new Error(
        `[ModuleRegistry] "${type}" must implement static createDefault(store).`
      );
    }

    if (typeof ModuleClass.prototype.render !== "function") {
      throw new Error(
        `[ModuleRegistry] "${type}" must implement render().`
      );
    }

    this.modules.set(type, ModuleClass);

    console.info(`[Narrative Editor] Registered module: ${type}`);
  }

  has(type) {
    return this.modules.has(type);
  }

  get(type) {
    return this.modules.get(type);
  }

  getRegisteredTypes() {
    return [...this.modules.keys()].sort();
  }

  createInstance(editor, moduleData) {
    const ModuleClass = this.modules.get(moduleData.type);

    if (!ModuleClass) {
      return new UnsupportedModule(editor, moduleData);
    }

    return new ModuleClass(editor, moduleData);
  }

  createDefault(type, store) {
    const ModuleClass = this.modules.get(type);

    if (!ModuleClass) {
      throw new Error(
        `[ModuleRegistry] Cannot create "${type}". ` +
        `Registered types: ${this.getRegisteredTypes().join(", ")}`
      );
    }

    const moduleData = ModuleClass.createDefault(store);

    if (
      !moduleData ||
      typeof moduleData !== "object" ||
      Array.isArray(moduleData) ||
      typeof moduleData.id !== "string" ||
      !moduleData.id ||
      moduleData.type !== type ||
      !moduleData.data ||
      typeof moduleData.data !== "object" ||
      Array.isArray(moduleData.data)
    ) {
      throw new Error(
        `[ModuleRegistry] "${type}".createDefault(store) must return ` +
        `a module with a non-empty string id, matching type, and data object.`
      );
    }

    return moduleData;
  }
}

/* -------------------------------------------------------------------------- */
/* EDITOR APPLICATION                                                          */
/* -------------------------------------------------------------------------- */

class NarrativeEditor {
  constructor(store, registry) {
    this.store = store;
    this.registry = registry;
    this.selectedModuleId = null;
    this.editingCharacterId = null;

    this.elements = {
      canvas: document.querySelector("#canvas"),
      characterList: document.querySelector("#character-list"),
      inspectorBody: document.querySelector("#inspector-body"),
      inspector: document.querySelector(".inspector"),
      workspace: document.querySelector(".workspace"),
      focusSelectedModuleButton: document.querySelector("#focus-selected-module-btn"),
      inspectorSubtitle: document.querySelector("#inspector-subtitle"),
      projectTitle: document.querySelector("#project-title"),
      moduleCountLabel: document.querySelector("#module-count-label"),

      addCharacterButton: document.querySelector("#add-character-btn"),
      addPhoneButton: document.querySelector("#add-phone-btn"),
      addHeadingButton: document.querySelector("#add-heading-btn"),
      resetDemoButton: document.querySelector("#reset-demo-btn"),
      exportButton: document.querySelector("#export-btn"),

      characterDialog: document.querySelector("#character-dialog"),
      characterDialogTitle: document.querySelector("#character-dialog-title"),
      characterDialogBody: document.querySelector("#character-dialog-body"),
      saveCharacterButton: document.querySelector("#save-character-btn"),

      exportDialog: document.querySelector("#export-dialog"),
      exportOutput: document.querySelector("#export-output"),
      copyExportButton: document.querySelector("#copy-export-btn"),
      undoButton: document.querySelector("#undo-btn"),
      redoButton: document.querySelector("#redo-btn"),
      importButton: document.querySelector("#import-btn"),
      importDialog: document.querySelector("#import-dialog"),
      importInput: document.querySelector("#import-input"),
      validateImportButton: document.querySelector("#validate-import-btn"),
      loadImportButton: document.querySelector("#load-import-btn"),
      importValidationOutput: document.querySelector("#import-validation-output"),
      socialProfileList: document.querySelector("#social-profile-list"),
    newspaperProfileList: document.querySelector("#newspaper-profile-list"),

    addSocialProfileButton: document.querySelector("#add-social-profile-btn"),
    addNewspaperProfileButton: document.querySelector("#add-newspaper-profile-btn"),

    socialProfileDialog: document.querySelector("#social-profile-dialog"),
    socialProfileDialogTitle: document.querySelector("#social-profile-dialog-title"),
    socialProfileDialogBody: document.querySelector("#social-profile-dialog-body"),
    saveSocialProfileButton: document.querySelector("#save-social-profile-btn"),

    newspaperProfileDialog: document.querySelector("#newspaper-profile-dialog"),
    newspaperProfileDialogTitle: document.querySelector("#newspaper-profile-dialog-title"),
    newspaperProfileDialogBody: document.querySelector("#newspaper-profile-dialog-body"),
    saveNewspaperProfileButton: document.querySelector("#save-newspaper-profile-btn"),

    moduleSearchInput: document.querySelector("#module-search-input"),
    outlineSearchInput: document.querySelector("#outline-search-input"),
    outlineList: document.querySelector("#outline-list"),
    readerExportButton: document.querySelector("#reader-export-btn"),

    projectTitleInput: document.querySelector("#project-title-input"),
    pageBackgroundInput: document.querySelector("#page-background-input"),
    canvasBackgroundInput: document.querySelector("#canvas-background-input"),
    canvasWidthSelect: document.querySelector("#canvas-width-select"),
    backgroundShapeSelect: document.querySelector("#background-shape-select"),
    readerTextSizeSelect: document.querySelector("#reader-text-size-select"),
    readerLineSpacingSelect: document.querySelector("#reader-line-spacing-select"),
    exportMenuButton: document.querySelector("#export-menu-btn"),
    exportMenu: document.querySelector("#export-menu"),
    exportProjectJsonButton: document.querySelector("#export-project-json-btn"),
    exportReaderJsonButton: document.querySelector("#export-reader-json-btn"),
    exportStandaloneHtmlButton: document.querySelector("#export-standalone-html-btn"),
    exportDialogTitle: document.querySelector("#export-dialog-title"),
    fontFamilySelect: document.querySelector("#font-family-select"),
    overlaySettings: {
      scanlines: document.querySelector("#overlay-scanlines"),
      vignette: document.querySelector("#overlay-vignette"),
      grain: document.querySelector("#overlay-grain"),
      crtFlicker: document.querySelector("#overlay-crt-flicker"),
      paperTexture: document.querySelector("#overlay-paper-texture"),
      reducedMotion: document.querySelector("#reduced-motion"),
    },
    readerEffectSettings: {
      redactionReveal: document.querySelector("#reader-redaction-reveal"),
      imageGlitchOnHover: document.querySelector("#reader-image-glitch"),
      evidenceFocusBlur: document.querySelector("#reader-evidence-focus"),
    },
    validateProjectButton: document.querySelector("#validate-project-btn"),
    clearAutosaveButton: document.querySelector("#clear-autosave-btn"),
    projectValidationOutput: document.querySelector("#project-validation-output"),
    toast: document.querySelector("#editor-toast"),
    modulePreviewDialog: document.querySelector("#module-preview-dialog"),
    modulePreviewBody: document.querySelector("#module-preview-body"),
    modulePreviewSubtitle: document.querySelector("#module-preview-subtitle"),
    closeModulePreviewButton: document.querySelector(
      "#close-module-preview-btn"
    ),
    projectHealthPanel: document.querySelector("#project-health-panel"),
    refreshProjectHealthButton: document.querySelector(
      "#refresh-project-health-btn"
    ),
    };
    this.toastTimer = null;
    this.editingSocialProfileId = null;
    this.editingNewspaperProfileId = null;
    this.activeSidebarTab = "modules";
    this.store.subscribe(() => this.render());
    this.bindGlobalEvents();
    this.bindWorkspaceTools();
    this.render();
  }

  bindNewProjectDialog() {
    const dialog = document.querySelector("#new-project-dialog");
    const form = document.querySelector("#new-project-form");
    const titleInput = document.querySelector("#new-project-title");
    const kindSelect = document.querySelector("#new-project-kind");

    document.querySelector("#new-project-btn")?.addEventListener("click", () => {
      titleInput.value = "";
      kindSelect.value = "chapter";
      dialog.showModal();
      titleInput.focus();
    });

    document.querySelector("#new-project-cancel")?.addEventListener("click", () => {
      dialog.close();
    });

    form?.addEventListener("submit", (event) => {
      event.preventDefault();

      const current = this.store.getState();
      const fresh = ProjectSchema.createEmptyProject();
      const keep = kindSelect.value === "chapter";
      const title = titleInput.value.trim();

      const next = keep
        ? {
            ...Utils.clone(current),
            title: title || "Untitled Chapter",
            modules: [],
            meta: { ...(current.meta || {}), updatedAt: new Date().toISOString() },
          }
        : { ...fresh, title: title || fresh.title };

      this.selectedModuleId = null;
      this.store.replaceProject(next);
      dialog.close();
      this.showToast(keep ? "New chapter started. Undo brings the previous one back." : "New project created. Undo brings the previous one back.");
    });
  }

  bindWorkspaceTools() {
    document.querySelector("#restore-backup-btn")?.addEventListener("click", async () => {
      const backups = window.narrativeAutosave?.listBackups() || [];
      if (!backups.length) {
        this.showToast("No backups available yet.", "error");
        return;
      }
      const latest = backups[0];
      if (!(await askConfirm(`Restore backup from ${new Date(latest.savedAt).toLocaleString()}? Current work will be replaced (undo available).`, { confirmLabel: "Restore" }))) {
        return;
      }
      try {
        const project = JSON.parse(latest.json);
        const result = ProjectValidator.validate(project, this.registry);
        if (!result.valid) {
          this.showToast(`Backup invalid: ${result.errors[0]}`, "error");
          return;
        }
        this.selectedModuleId = null;
        this.store.replaceProject(project);
        this.showToast("Backup restored.");
      } catch (error) {
        this.showToast(`Restore failed: ${error.message}`, "error");
      }
    });

    this.elements.outlineSearchInput?.addEventListener("input", () => {
      this.renderOutline();
    });

    this.elements.readerExportButton?.addEventListener("click", () => {
      if (this.elements.exportDialogTitle) {
        this.elements.exportDialogTitle.textContent = "Reader JSON";
      }
      this.elements.exportOutput.value = JSON.stringify(
        this.buildReaderExport(),
        null,
        2
      );
      this.showToast("Reader export generated (drafts and author notes removed).");
    });
  }

  getModuleSummary(module) {
    const data = module.data || {};
    const candidates = [
      data.title,
      data.headline,
      data.subject,
      data.heading,
      data.name,
      data.text,
      data.body,
      data.content,
      data.caption,
    ];
    const found = candidates.find((value) => typeof value === "string" && value.trim());
    const text = (found || "").replace(/\s+/g, " ").trim();
    return text.length > 60 ? `${text.slice(0, 57)}…` : text;
  }

  collectSearchText(module) {
    const parts = [];
    const walk = (value) => {
      if (typeof value === "string") {
        parts.push(value);
      } else if (Array.isArray(value)) {
        value.forEach(walk);
      } else if (value && typeof value === "object") {
        Object.values(value).forEach(walk);
      }
    };
    walk(module.data);
    walk(module.meta);
    return parts.join(" \n ").toLowerCase();
  }

  renderOutline() {
    const list = this.elements.outlineList;
    if (!list) {
      return;
    }

    const query = (this.elements.outlineSearchInput?.value || "").trim().toLowerCase();
    const modules = this.store.getState().modules;

    const rows = modules
      .map((module, index) => ({ module, index }))
      .filter(({ module }) => !query || this.collectSearchText(module).includes(query));

    if (!rows.length) {
      list.innerHTML = `<p class="outline-empty">${
        modules.length ? "No modules match your search." : "No modules yet."
      }</p>`;
      return;
    }

    list.innerHTML = rows
      .map(({ module, index }) => {
        const summary = this.getModuleSummary(module);
        const selected = module.id === this.selectedModuleId ? " is-selected" : "";
        const draft = module.meta?.draft ? '<span class="outline-badge">draft</span>' : "";
        return `
          <button type="button" class="outline-item${selected}" role="listitem" data-outline-module="${Utils.escapeHtml(module.id)}">
            <span class="outline-index">${index + 1}</span>
            <span class="outline-text">
              <strong>${Utils.escapeHtml(this.getModuleDisplayName(module.type))}</strong>
              <small>${Utils.escapeHtml(summary)}</small>
            </span>
            ${draft}
          </button>
        `;
      })
      .join("");

    list.querySelectorAll("[data-outline-module]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.outlineModule;
        this.selectModule(id);
        this.elements.canvas
          .querySelector(`[data-module-id="${CSS.escape(id)}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  }

  buildReaderExport() {
    return ReaderExporter.exportProject(this.store.getState());
  }

  closeExportMenu() {
    const { exportMenu, exportMenuButton } = this.elements;
    if (exportMenu) exportMenu.hidden = true;
    exportMenuButton?.setAttribute("aria-expanded", "false");
  }

  bindExportMenu() {
    const { exportMenu, exportMenuButton } = this.elements;
    if (!exportMenu || !exportMenuButton || this.exportMenuBound) {
      return;
    }
    this.exportMenuBound = true;

    exportMenuButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = exportMenu.hidden;
      exportMenu.hidden = !open;
      exportMenuButton.setAttribute("aria-expanded", String(open));
      if (open) {
        exportMenu.querySelector("button")?.focus();
      }
    });

    document.addEventListener("click", (event) => {
      if (!exportMenu.contains(event.target)) this.closeExportMenu();
    });

    exportMenu.addEventListener("keydown", (event) => {
      const items = [...exportMenu.querySelectorAll("button")];
      const index = items.indexOf(document.activeElement);
      if (event.key === "Escape") {
        this.closeExportMenu();
        exportMenuButton.focus();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        items[(index + 1) % items.length].focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        items[(index - 1 + items.length) % items.length].focus();
      }
    });

    this.elements.exportButton?.addEventListener("click", () => {
      this.closeExportMenu();
      this.openJsonExportDialog(
        "Project JSON",
        JSON.stringify(this.store.getState(), null, 2)
      );
    });

    this.elements.exportProjectJsonButton?.addEventListener("click", () => {
      this.closeExportMenu();
      this.downloadProjectJson();
    });

    this.elements.exportReaderJsonButton?.addEventListener("click", () => {
      this.closeExportMenu();
      this.downloadReaderJson();
    });

    this.elements.exportStandaloneHtmlButton?.addEventListener("click", () => {
      this.closeExportMenu();
      this.downloadStandaloneHtml();
    });
  }

  openJsonExportDialog(title, jsonText) {
    if (this.elements.exportDialogTitle) {
      this.elements.exportDialogTitle.textContent = title;
    }
    this.elements.exportOutput.value = jsonText;
    if (!this.elements.exportDialog.open) {
      this.elements.exportDialog.showModal();
    }
  }

  getExportBaseName() {
    return DownloadHelper.safeFilename(this.store.getState().title);
  }

  downloadProjectJson() {
    DownloadHelper.text(
      `${this.getExportBaseName()}-project.json`,
      JSON.stringify(this.store.getState(), null, 2),
      "application/json;charset=utf-8"
    );
    this.showToast("Project JSON downloaded.");
  }

  downloadReaderJson() {
    DownloadHelper.text(
      `${this.getExportBaseName()}-reader.json`,
      ReaderExporter.stringify(this.store.getState()),
      "application/json;charset=utf-8"
    );
    this.showToast("Reader JSON downloaded (drafts and author notes removed).");
  }

  renderModuleForReader(moduleData) {
    const instance = this.registry.createInstance(this, {
      ...moduleData,
      ui: { ...(moduleData.ui || {}), collapsed: false },
    });
    const container = document.createElement("div");
    const savedFocusState = NewspaperArticleModule.focusState;
    NewspaperArticleModule.focusState = new Map();
    try {
      container.innerHTML = instance.render();
    } finally {
      NewspaperArticleModule.focusState = savedFocusState;
    }
    container
      .querySelectorAll(".module-actions, .module-warning-badge")
      .forEach((element) => element.remove());
    container.querySelectorAll(".placed-module").forEach((element) => {
      element.classList.remove("selected");
      element.removeAttribute("draggable");
      element.removeAttribute("tabindex");
      element.setAttribute("id", moduleData.id);
      const css = instance.getStyleOverrideCss();
      if (css) {
        element.setAttribute("style", `${element.getAttribute("style") || ""};${css}`);
      }
      if (moduleData.styleOverrides?.backgroundColor) {
        element.classList.add("has-custom-background");
      }
    });
    container.querySelectorAll("[contenteditable]").forEach((element) => {
      element.removeAttribute("contenteditable");
    });
    return container.innerHTML;
  }

  async downloadStandaloneHtml() {
    try {
      const html = await StandaloneHtmlExporter.export(
        this.store.getState(),
        (moduleData) => this.renderModuleForReader(moduleData)
      );
      DownloadHelper.text(
        `${this.getExportBaseName()}-reader.html`,
        html,
        "text/html;charset=utf-8"
      );
      this.showToast("Standalone HTML downloaded.");
    } catch (error) {
      this.showToast(`HTML export failed: ${error.message}`, "error");
    }
  }

  renderMetaEditor(module) {
    const meta = ProjectSchema.createDefaultModuleMeta(module.meta);
    const e = (value) => Utils.escapeHtml(String(value ?? ""));
    const field = (key, label, type = "text") => `
      <label class="field-label">${label}
        <input class="form-control" type="${type}" data-meta-field="${key}" value="${e(meta[key])}" />
      </label>`;
    const select = (key, label, options) => `
      <label class="field-label">${label}
        <select class="form-control" data-meta-field="${key}">
          ${options.map((o) => `<option value="${o}" ${meta[key] === o ? "selected" : ""}>${o}</option>`).join("")}
        </select>
      </label>`;

    return `
      <details class="meta-editor" open>
        <summary>Metadata &amp; author notes</summary>
        ${field("timelineDate", "Timeline date")}
        ${field("displayDate", "Display date")}
        ${field("location", "Location")}
        ${field("tags", "Tags (comma separated)")}
        ${field("evidenceId", "Evidence ID")}
        ${select("reliability", "Reliability", ["direct", "secondhand", "unreliable", "forged", "unknown"])}
        ${select("unlockState", "Unlock state", ["visible", "locked", "hidden"])}
        <label class="checkbox-label">
          <input type="checkbox" data-meta-field="draft" ${meta.draft ? "checked" : ""} />
          Draft (excluded from reader export)
        </label>
        <label class="field-label">Author note (never exported to readers)
          <textarea class="form-control" rows="3" data-meta-field="authorNote">${e(meta.authorNote)}</textarea>
        </label>
      </details>`;
  }

  bindMetaEditor(container, moduleId) {
    container.querySelectorAll("[data-meta-field]").forEach((input) => {
      const key = input.dataset.metaField;
      input.addEventListener("change", () => {
        let value = input.type === "checkbox" ? input.checked : input.value;
        if (key === "tags") {
          value = String(value).split(",").map((t) => t.trim()).filter(Boolean);
        }
        this.store.updateModuleMeta(moduleId, { [key]: value });
      });
    });
  }

  setSidebarTab(tabName) {
    this.activeSidebarTab = tabName;

    document.querySelectorAll("[data-sidebar-tab]").forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.sidebarTab === tabName
      );
    });

    document.querySelectorAll("[data-sidebar-pane]").forEach((pane) => {
      pane.classList.toggle(
        "active",
        pane.dataset.sidebarPane === tabName
      );
    });
  }

  showToast(message, type = "success") {
    const toast = this.elements.toast;

    if (!toast) {
      return;
    }

    clearTimeout(this.toastTimer);
    toast.textContent = message;
    toast.classList.remove("error", "warning", "visible");

    if (type === "error" || type === "warning") {
      toast.classList.add(type);
    }

    requestAnimationFrame(() => toast.classList.add("visible"));
    this.toastTimer = setTimeout(() => {
      toast.classList.remove("visible");
    }, 2600);
  }

  isTypingInEditableControl(target) {
    if (!target) {
      return false;
    }

    const tagName = target.tagName?.toLowerCase();
    return (
      tagName === "input" ||
      tagName === "textarea" ||
      tagName === "select" ||
      target.isContentEditable
    );
  }

  handleKeyboardShortcuts(event) {
    const modifierPressed = event.ctrlKey || event.metaKey;

    if (!modifierPressed) {
      return;
    }

    const key = event.key.toLowerCase();
    const isTyping = this.isTypingInEditableControl(event.target);

    if (key === "s") {
      event.preventDefault();
      const saved = window.narrativeAutosave?.saveNow?.();
      this.showToast(
        saved === false ? "Could not save project locally." : "Project saved locally.",
        saved === false ? "error" : "success"
      );
      return;
    }

    if (isTyping) {
      return;
    }

    if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      this.showToast(
        this.store.undo() ? "Undid last project change." : "Nothing to undo."
      );
      return;
    }

    if (key === "z" && event.shiftKey) {
      event.preventDefault();
      this.showToast(
        this.store.redo() ? "Redid project change." : "Nothing to redo."
      );
    }
  }

  filterModuleLibrary(searchValue) {
    const query = searchValue.trim().toLowerCase();

    document.querySelectorAll(".module-type-btn[data-module-type]").forEach(
      (button) => {
        const matches = button.textContent.toLowerCase().includes(query);

        button.classList.toggle("hidden-by-search", !matches);
      }
    );
  }

  showProjectValidation(result) {
    const output = this.elements.projectValidationOutput;

    output.textContent = ProjectValidator.format(result);
    output.className = "validation-output visible";

    if (!result.valid) {
      output.classList.add("error");
      return;
    }

    if (result.warnings.length) {
      output.classList.add("warning");
      return;
    }

    output.classList.add("success");
  }

  bindCanvasDragAndDrop() {
  const canvas = this.elements.canvas;

  let draggedModuleId = null;

  canvas.querySelectorAll("[data-module-id]").forEach((moduleElement) => {
    moduleElement.addEventListener("dragstart", (event) => {
      draggedModuleId = moduleElement.dataset.moduleId;

      moduleElement.classList.add("is-dragging");

      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedModuleId);
    });

    moduleElement.addEventListener("dragend", () => {
      draggedModuleId = null;

      canvas
        .querySelectorAll(".placed-module")
        .forEach((element) => {
          element.classList.remove(
            "is-dragging",
            "drag-over-before",
            "drag-over-after"
          );
        });
    });

    moduleElement.addEventListener("dragover", (event) => {
      event.preventDefault();

      if (
        !draggedModuleId ||
        draggedModuleId === moduleElement.dataset.moduleId
      ) {
        return;
      }

      const bounds = moduleElement.getBoundingClientRect();
      const before = event.clientY < bounds.top + bounds.height / 2;

      moduleElement.classList.toggle("drag-over-before", before);
      moduleElement.classList.toggle("drag-over-after", !before);

      event.dataTransfer.dropEffect = "move";
    });

    moduleElement.addEventListener("dragleave", () => {
      moduleElement.classList.remove(
        "drag-over-before",
        "drag-over-after"
      );
    });

    moduleElement.addEventListener("drop", (event) => {
      event.preventDefault();

      const sourceId =
        draggedModuleId || event.dataTransfer.getData("text/plain");

      const targetId = moduleElement.dataset.moduleId;

      if (!sourceId || sourceId === targetId) {
        return;
      }

      const modules = this.store.getState().modules;

      const sourceIndex = modules.findIndex(
        (module) => module.id === sourceId
      );

      const targetIndex = modules.findIndex(
        (module) => module.id === targetId
      );

      if (sourceIndex < 0 || targetIndex < 0) {
        return;
      }

      const bounds = moduleElement.getBoundingClientRect();
      const droppedBefore = event.clientY < bounds.top + bounds.height / 2;

      let insertionIndex = droppedBefore ? targetIndex : targetIndex + 1;

      if (sourceIndex < insertionIndex) {
        insertionIndex -= 1;
      }

      this.store.moveModuleToIndex(sourceId, insertionIndex);
    });
  });
}
  renderProjectSettings() {
    const settings = this.store.getState().settings || {};

    this.elements.projectTitleInput.value =
      this.store.getState().title || "";

    this.elements.pageBackgroundInput.value =
      settings.pageBackground || "#0c0d13";

    this.elements.canvasBackgroundInput.value =
      settings.canvasBackground || "#0c0d13";

    this.elements.canvasWidthSelect.value =
      settings.canvasWidth || "standard";

    this.elements.fontFamilySelect.value =
      settings.fontFamily || "system";

    if (this.elements.readerTextSizeSelect) {
      this.elements.readerTextSizeSelect.value =
        settings.readerTextSize || "normal";
    }

    if (this.elements.readerLineSpacingSelect) {
      this.elements.readerLineSpacingSelect.value =
        settings.readerLineSpacing || "normal";
    }

    if (this.elements.backgroundShapeSelect) {
      this.elements.backgroundShapeSelect.value =
        settings.backgroundShape || "none";
    }

    Object.entries(this.elements.overlaySettings).forEach(([key, input]) => {
      if (input) {
        input.checked = Boolean(settings.overlays?.[key]);
      }
    });

    Object.entries(this.elements.readerEffectSettings).forEach(
      ([key, input]) => {
        if (input) {
          input.checked = Boolean(settings.readerEffects?.[key]);
        }
      }
    );
  }
applyProjectSettings() {
  const settings = this.store.getState().settings || {};

  const fontMap = {
    system:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    serif:
      'Georgia, "Times New Roman", Times, serif',
    mono:
      '"Courier New", Courier, ui-monospace, monospace',
  };

  const widthMap = {
    narrow: "560px",
    standard: "780px",
    wide: "1040px",
  };

  const overlays = settings.overlays || {};
  const readerEffects = settings.readerEffects || {};

  document.body.style.backgroundColor =
    settings.pageBackground || "#0c0d13";

  document.documentElement.style.setProperty(
    "--project-font-family",
    fontMap[settings.fontFamily] || fontMap.system
  );

  document.documentElement.style.setProperty(
    "--reader-scale",
    { small: 0.92, normal: 1, large: 1.12, xlarge: 1.25 }[
      settings.readerTextSize
    ] || 1
  );

  document.documentElement.style.setProperty(
    "--reader-leading",
    { tight: 1.35, normal: 1.55, relaxed: 1.75 }[
      settings.readerLineSpacing
    ] || 1.55
  );

  document.documentElement.style.setProperty(
    "--project-canvas-width",
    widthMap[settings.canvasWidth] || widthMap.standard
  );

  this.elements.canvas.style.backgroundColor =
    settings.canvasBackground || "#0c0d13";

  this.elements.canvas.dataset.bgShape = settings.backgroundShape || "none";

  const bodyClasses = [
    "project-overlay-scanlines",
    "project-overlay-vignette",
    "project-overlay-grain",
    "project-overlay-crt-flicker",
    "project-overlay-paper-texture",
    "project-reduced-motion",
    "reader-redaction-reveal",
    "reader-image-glitch",
    "reader-evidence-focus",
  ];

  document.body.classList.remove(...bodyClasses);

  if (overlays.scanlines) {
    document.body.classList.add("project-overlay-scanlines");
  }

  if (overlays.vignette) {
    document.body.classList.add("project-overlay-vignette");
  }

  if (overlays.grain) {
    document.body.classList.add("project-overlay-grain");
  }

  if (overlays.crtFlicker) {
    document.body.classList.add("project-overlay-crt-flicker");
  }

  if (overlays.paperTexture) {
    document.body.classList.add("project-overlay-paper-texture");
  }

  if (overlays.reducedMotion) {
    document.body.classList.add("project-reduced-motion");
  }

  if (readerEffects.redactionReveal) {
    document.body.classList.add("reader-redaction-reveal");
  }

  if (readerEffects.imageGlitchOnHover) {
    document.body.classList.add("reader-image-glitch");
  }

  if (readerEffects.evidenceFocusBlur) {
    document.body.classList.add("reader-evidence-focus");
  }
}

  bindGlobalEvents() {
    this.elements.addCharacterButton.addEventListener("click", () => {
      this.openCharacterDialog();
    });

    this.elements.addPhoneButton.addEventListener("click", () => {
      this.addModule("phone-thread");
    });

    this.elements.addHeadingButton.addEventListener("click", () => {
      this.addModule("scene-heading");
    });
    document.querySelectorAll("[data-sidebar-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        this.setSidebarTab(button.dataset.sidebarTab);
      });
    });

    this.elements.moduleSearchInput?.addEventListener("input", () => {
      this.filterModuleLibrary(this.elements.moduleSearchInput.value);
    });

    this.elements.addSocialProfileButton?.addEventListener("click", () => {
      this.openSocialProfileDialog();
    });

    this.elements.addNewspaperProfileButton?.addEventListener("click", () => {
      this.openNewspaperProfileDialog();
    });

    this.elements.saveSocialProfileButton?.addEventListener("click", (event) => {
      event.preventDefault();
      this.saveSocialProfileFromDialog();
    });

    this.elements.saveNewspaperProfileButton?.addEventListener("click", (event) => {
      event.preventDefault();
      this.saveNewspaperProfileFromDialog();
    });

    this.elements.validateProjectButton?.addEventListener("click", () => {
      this.validateProject();
    });

    this.elements.clearAutosaveButton?.addEventListener("click", () => {
      this.clearAutosave();
    });

    this.elements.exportButton?.addEventListener("click", () => {
      this.exportProject();
    });

    this.elements.undoButton?.addEventListener("click", () => {
      this.undo();
    });

    this.elements.redoButton?.addEventListener("click", () => {
      this.redo();
    });

    this.elements.importButton?.addEventListener("click", () => {
      this.openImportDialog();
    });

    this.elements.validateImportButton?.addEventListener("click", () => {
      this.validateImport();
    });

    this.elements.loadImportButton?.addEventListener("click", () => {
      this.loadImport();
    });

    this.elements.projectTitleInput?.addEventListener("input", (event) => {
      this.updateProjectTitle(event.target.value);
    });

    this.elements.pageBackgroundInput?.addEventListener("input", (event) => {
      this.updateProjectSetting("pageBackground", event.target.value);
    });

    this.elements.canvasBackgroundInput?.addEventListener("input", (event) => {
      this.updateProjectSetting("canvasBackground", event.target.value);
    });

    this.elements.canvasWidthSelect?.addEventListener("change", (event) => {
      this.updateProjectSetting("canvasWidth", event.target.value);
    });

    this.elements.fontFamilySelect?.addEventListener("change", (event) => {
      this.updateProjectSetting("fontFamily", event.target.value);
    });

    this.elements.overlayEffectSelect?.addEventListener("change", (event) => {
      this.updateProjectSetting("overlayEffect", event.target.value);
    });

    this.elements.copyExportButton?.addEventListener("click", () => {
      this.copyExportOutput();
    });

    this.elements.importInput?.addEventListener("change", () => {
      this.validateImport();
    });

    this.elements.characterDialog?.addEventListener("close", () => {
      this.closeCharacterDialog();
    });

    this.elements.exportDialog?.addEventListener("close", () => {
      this.closeExportDialog();
    });

    this.elements.importDialog?.addEventListener("close", () => {
      this.closeImportDialog();
    });

    this.elements.socialProfileDialog?.addEventListener("close", () => {
      this.closeSocialProfileDialog();
    });

    this.elements.newspaperProfileDialog?.addEventListener("close", () => {
      this.closeNewspaperProfileDialog();
    });
  }

  render() {
    this.renderProjectSettings();
    this.renderCanvas();
    this.renderInspector();
    this.renderCharacterList();
    this.renderSocialProfiles();
    this.renderNewspaperProfiles();
    this.renderModuleLibrary();
    this.renderProjectInfo();
    this.applyProjectSettings();
    this.renderAutosaveStatus();
    this.bindCanvasSelection();
    this.renderCharacters();
    this.renderSocialProfiles();
    this.renderNewspaperProfiles();
    this.renderProjectSettings();
    this.applyProjectSettings();
    this.renderCanvas();
    this.renderInspector();
    this.updateHistoryButtons();
    this.bindCanvasDragAndDrop();
  }

  bindGlobalEvents() {
    this.elements.addCharacterButton.addEventListener("click", () => {
      this.openCharacterDialog();
    });

    this.elements.addPhoneButton.addEventListener("click", () => {
      this.addModule("phone-thread");
    });

    this.elements.addHeadingButton.addEventListener("click", () => {
      this.addModule("scene-heading");
    });
    document.querySelectorAll("[data-sidebar-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        this.setSidebarTab(button.dataset.sidebarTab);
      });
    });

    this.elements.moduleSearchInput?.addEventListener("input", () => {
      this.filterModuleLibrary(this.elements.moduleSearchInput.value);
    });

    this.elements.addSocialProfileButton?.addEventListener("click", () => {
      this.openSocialProfileDialog();
    });

    this.elements.addNewspaperProfileButton?.addEventListener("click", () => {
      this.openNewspaperProfileDialog();
    });

    this.elements.saveSocialProfileButton?.addEventListener("click", (event) => {
      event.preventDefault();
      this.saveSocialProfileFromDialog();
    });

    this.elements.saveNewspaperProfileButton?.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        this.saveNewspaperProfileFromDialog();
      }
    );

    this.elements.projectTitleInput?.addEventListener("input", () => {
      this.store.updateProject({
        title: this.elements.projectTitleInput.value,
      });
    });

    this.elements.pageBackgroundInput?.addEventListener("input", () => {
      this.store.updateSettings({
        pageBackground: this.elements.pageBackgroundInput.value,
      });
    });

    this.elements.canvasBackgroundInput?.addEventListener("input", () => {
      this.store.updateSettings({
        canvasBackground: this.elements.canvasBackgroundInput.value,
      });
    });

    this.elements.backgroundShapeSelect?.addEventListener("change", () => {
      this.store.updateSettings({
        backgroundShape: this.elements.backgroundShapeSelect.value,
      });
    });

    this.elements.readerTextSizeSelect?.addEventListener("change", () => {
      this.store.updateSettings({
        readerTextSize: this.elements.readerTextSizeSelect.value,
      });
    });

    this.elements.readerLineSpacingSelect?.addEventListener("change", () => {
      this.store.updateSettings({
        readerLineSpacing: this.elements.readerLineSpacingSelect.value,
      });
    });

    this.bindExportMenu();
    this.bindInspectorAlignment();

    this.elements.canvasWidthSelect?.addEventListener("change", () => {
      this.store.updateSettings({
        canvasWidth: this.elements.canvasWidthSelect.value,
      });
    });

    this.elements.fontFamilySelect?.addEventListener("change", () => {
      this.store.updateSettings({
        fontFamily: this.elements.fontFamilySelect.value,
      });
    });

    [
      [this.elements.overlaySettings, "overlays"],
      [this.elements.readerEffectSettings, "readerEffects"],
    ].forEach(([inputs, settingGroup]) => {
      Object.entries(inputs).forEach(([key, input]) => {
        input?.addEventListener("change", () => {
          const settings = this.store.getState().settings || {};
          this.store.updateSettings({
            [settingGroup]: {
              ...(settings[settingGroup] || {}),
              [key]: input.checked,
            },
          });
        });
      });
    });

    this.elements.validateProjectButton?.addEventListener("click", () => {
      const result = ProjectValidator.validate(
        this.store.getState(),
        this.registry
      );

      this.showProjectValidation(result);
    });
    this.elements.refreshProjectHealthButton?.addEventListener("click", () => {
      this.renderProjectHealth();
      this.showToast("Project health refreshed.");
    });

    this.elements.clearAutosaveButton?.addEventListener("click", async () => {
      if (
        await askConfirm(
          "Remove the locally autosaved copy? The currently open project will remain loaded.",
          { confirmLabel: "Remove", danger: true }
        )
      ) {
        window.narrativeAutosave?.clear();
        notifyUser("Local autosave cleared.");
      }
    });
    document.querySelectorAll("[data-module-type]").forEach((button) => {
      button.addEventListener("click", () => {
        this.addModule(button.dataset.moduleType);
      });
    });

    this.bindNewProjectDialog();

    this.elements.resetDemoButton.addEventListener("click", async () => {
      if (await askConfirm("Reset the editor to the included demo project? Undo will still be available.", { confirmLabel: "Reset", danger: true })) {
        this.selectedModuleId = null;
        this.store.replaceProject(createDemoProject());
      }
    });

    this.elements.exportButton.addEventListener("click", () => {
      this.elements.exportOutput.value = JSON.stringify(
        this.store.getState(),
        null,
        2
      );

      this.elements.exportDialog.showModal();
    });

    this.elements.copyExportButton.addEventListener("click", async (event) => {
      event.preventDefault();

      try {
        await navigator.clipboard.writeText(this.elements.exportOutput.value);

        const oldText = this.elements.copyExportButton.textContent;
        this.elements.copyExportButton.textContent = "Copied";

        setTimeout(() => {
          this.elements.copyExportButton.textContent = oldText;
        }, 1200);
      } catch {
        this.elements.exportOutput.select();
        document.execCommand("copy");
      }
    });
    this.elements.undoButton.addEventListener("click", () => {
  this.store.undo();
  this.updateHistoryButtons();
});

this.elements.redoButton.addEventListener("click", () => {
  this.store.redo();
  this.updateHistoryButtons();
});

this.elements.importButton.addEventListener("click", () => {
  this.elements.importInput.value = "";
  this.elements.importValidationOutput.textContent = "";
  this.elements.importValidationOutput.className = "validation-output";

  this.elements.importDialog.showModal();
});

this.elements.validateImportButton.addEventListener("click", (event) => {
  event.preventDefault();
  this.readAndValidateImport();
});

this.elements.loadImportButton.addEventListener("click", async (event) => {
  event.preventDefault();

  const { result, project } = this.readAndValidateImport();

  if (!result.valid || !project) {
    return;
  }

  const warningMessage = result.warnings.length
    ? `\n\nThe import has ${result.warnings.length} warning(s). Unsupported modules may display as placeholders.`
    : "";

  if (!(await askConfirm(`Replace the current project with the imported project?${warningMessage}`, { confirmLabel: "Replace" }))) {
    return;
  }

  this.selectedModuleId = null;
  try {
    this.store.replaceProject(project);
  } catch (error) {
    this.showToast(`Import failed: ${error.message}`, "error");
    return;
  }
  this.elements.importDialog.close();
});

    this.elements.saveCharacterButton.addEventListener("click", (event) => {
      event.preventDefault();
      this.saveCharacterFromDialog();
    });

    this.elements.closeModulePreviewButton?.addEventListener("click", () => {
      this.elements.modulePreviewDialog.close();
    });
    this.elements.modulePreviewDialog?.addEventListener("click", (event) => {
      if (event.target === this.elements.modulePreviewDialog) {
        this.elements.modulePreviewDialog.close();
      }
    });
    document.addEventListener("keydown", (event) => {
      this.handleKeyboardShortcuts(event);
    });
  }
  showImportValidation(result) {
  const output = this.elements.importValidationOutput;

  output.textContent = ProjectValidator.format(result);

  output.className = "validation-output visible";

  if (!result.valid) {
    output.classList.add("error");
    return;
  }

  if (result.warnings.length) {
    output.classList.add("warning");
    return;
  }

  output.classList.add("success");
}

readAndValidateImport() {
  const rawJson = this.elements.importInput.value.trim();

  if (!rawJson) {
    const result = {
      valid: false,
      errors: ["Paste project JSON before validating."],
      warnings: [],
    };

    this.showImportValidation(result);
    return {
      result,
      project: null,
    };
  }

  try {
    const project = JSON.parse(rawJson);
    const result = ProjectValidator.validate(project, this.registry);

    this.showImportValidation(result);

    return {
      result,
      project,
    };
  } catch (error) {
    const result = {
      valid: false,
      errors: [`Invalid JSON: ${error.message}`],
      warnings: [],
    };

    this.showImportValidation(result);

    return {
      result,
      project: null,
    };
  }
}

updateHistoryButtons() {
  this.elements.undoButton.disabled = !this.store.canUndo();
  this.elements.redoButton.disabled = !this.store.canRedo();
}

addModule(type) {
  if (!this.registry.has(type)) {
    console.error(
      `[Narrative Editor] Sidebar requested unavailable type "${type}".`,
      {
        requestedType: type,
        registeredTypes: this.registry.getRegisteredTypes(),
      }
    );

    notifyUser(
      `The "${type}" module has not been registered yet.\n\n` +
      `Open the browser console for the list of registered module types.`
    );

    return;
  }

  try {
    const moduleData = this.registry.createDefault(type, this.store);

    this.store.addModule(moduleData);
    this.selectModule(moduleData.id);
  } catch (error) {
    console.error(
      `[Narrative Editor] Failed to create module "${type}".`,
      error
    );

    notifyUser(
      `The "${type}" module could not be created. ` +
      `Check its createDefault() implementation in narrative_editor.js.`
    );
  }
}

  selectModule(moduleId, options = {}) {
    this.selectedModuleId = moduleId;
    this.render();

    if (options.scroll !== false) {
      requestAnimationFrame(() => this.scrollSelectedModuleIntoView());
    }
  }

  queueInspectorAlignment() {
    cancelAnimationFrame(this.inspectorAlignmentFrame);
    this.inspectorAlignmentFrame = requestAnimationFrame(() =>
      this.alignInspectorToSelectedModule()
    );
  }

  getSelectedModuleElement() {
    if (!this.selectedModuleId) return null;
    return this.elements.canvas.querySelector(
      `[data-module-id="${CSS.escape(this.selectedModuleId)}"]`
    );
  }

  alignInspectorToSelectedModule() {
    const { inspector, workspace } = this.elements;
    if (!inspector || !workspace) return;

    const moduleElement = this.getSelectedModuleElement();
    const isNarrow = window.matchMedia("(max-width: 1100px)").matches;

    if (!moduleElement || isNarrow) {
      inspector.classList.remove("is-module-aligned");
      inspector.style.removeProperty("--inspector-module-offset");
      return;
    }

    const workspaceBounds = workspace.getBoundingClientRect();
    const moduleBounds = moduleElement.getBoundingClientRect();
    const minimumPanelHeight = 320;
    const maxOffset = Math.max(
      0,
      workspace.clientHeight - minimumPanelHeight
    );
    const offset = Math.max(
      0,
      Math.min(moduleBounds.top - workspaceBounds.top, maxOffset)
    );

    inspector.style.setProperty(
      "--inspector-module-offset",
      `${Math.round(offset)}px`
    );
    inspector.classList.add("is-module-aligned");
  }

  scrollSelectedModuleIntoView(options = {}) {
    const moduleElement = this.getSelectedModuleElement();
    const { workspace } = this.elements;

    if (!moduleElement || !workspace) return;

    const moduleBounds = moduleElement.getBoundingClientRect();
    const workspaceBounds = workspace.getBoundingClientRect();
    const outOfView =
      moduleBounds.top < workspaceBounds.top + 18 ||
      moduleBounds.top > workspaceBounds.bottom - 120;

    if (options.force || outOfView) {
      const reduceMotion =
        this.store.getState().settings?.overlays?.reducedMotion ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      moduleElement.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
    }

    this.queueInspectorAlignment();
  }

  bindInspectorAlignment() {
    if (this.inspectorAlignmentBound) return;
    this.inspectorAlignmentBound = true;

    window.addEventListener("resize", () => this.queueInspectorAlignment());
    this.elements.workspace?.addEventListener(
      "scroll",
      () => this.queueInspectorAlignment(),
      { passive: true }
    );
    this.elements.focusSelectedModuleButton?.addEventListener("click", () =>
      this.scrollSelectedModuleIntoView({ force: true })
    );
  }

  getSelectedModule() {
    return this.store.getModule(this.selectedModuleId);
  }

  render() {
    const project = this.store.getState();

    if (
      this.selectedModuleId &&
      !project.modules.some((module) => module.id === this.selectedModuleId)
    ) {
      this.selectedModuleId = null;
    }

    this.elements.projectTitle.textContent = project.title || "Untitled Project";
    this.elements.moduleCountLabel.textContent = `${project.modules.length} ${
      project.modules.length === 1 ? "module" : "modules"
    }`;

    this.renderCharacters();
    this.renderSocialProfiles();
    this.renderNewspaperProfiles();
    this.renderProjectSettings();
    this.applyProjectSettings();
    this.renderCanvas();
    this.renderInspector();
    this.renderProjectHealth();
    this.renderOutline();
    this.updateHistoryButtons();
    this.bindCanvasDragAndDrop();
    this.queueInspectorAlignment();
  }

  renderCharacters() {
    const characters = this.store.getState().characters;

    this.elements.characterList.innerHTML = characters
      .map((character) => {
        const style = CharacterTheme.getCssVariables(character);

        return `
          <article draggable="true" class="character-card">
            <div class="character-card-main">
              <div
                class="character-swatch"
                style="${style}"
                aria-hidden="true"
              ></div>

              <div
                class="character-avatar"
                style="${style}"
                aria-hidden="true"
              >
                ${Utils.escapeHtml(
                  character.avatar || character.shortName?.charAt(0) || "?"
                )}
              </div>

              <div>
                <div class="character-name">
                  ${Utils.escapeHtml(character.name)}
                </div>

                <div class="character-meta">
                  ${Utils.escapeHtml(character.shortName || "Character")} · ${
                    character.primaryColor
                  }
                </div>
              </div>
            </div>

            <div class="character-actions">
              <button
                class="character-action"
                type="button"
                data-edit-character="${character.id}"
                title="Edit character"
              >
                ✎
              </button>

              <button
                class="character-action delete"
                type="button"
                data-delete-character="${character.id}"
                title="Delete character"
              >
                ×
              </button>
            </div>
          </article>
        `;
      })
      .join("");

    this.elements.characterList
      .querySelectorAll("[data-edit-character]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          this.openCharacterDialog(button.dataset.editCharacter);
        });
      });

    this.elements.characterList
      .querySelectorAll("[data-delete-character]")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          const character = this.store.getCharacter(
            button.dataset.deleteCharacter
          );

          if (!character) {
            return;
          }

          if (await askConfirm(`Delete ${character.name}?`, { confirmLabel: "Delete", danger: true })) {
            this.store.deleteCharacter(character.id);
          }
        });
      });
  }
  renderSocialProfiles() {
  const profiles = Utils.safeArray(this.store.getState().socialProfiles);

  this.elements.socialProfileList.innerHTML = profiles.length
    ? profiles
        .map((profile) => {
          const owner = profile.ownerCharacterId
            ? this.store.getCharacter(profile.ownerCharacterId)
            : null;

          return `
            <article draggable="true" class="profile-card">
              <div class="profile-card-main">
                <div class="profile-card-icon">♥</div>

                <div>
                  <div class="profile-card-name">
                    ${Utils.escapeHtml(profile.displayName || "Unnamed profile")}
                  </div>

                  <div class="profile-card-meta">
                    ${Utils.escapeHtml(profile.handle || "@unknown")} ·
                    ${Utils.escapeHtml(profile.platform || "social")}
                    ${owner ? ` · ${Utils.escapeHtml(owner.name)}` : ""}
                  </div>
                </div>
              </div>

              <div class="character-actions">
                <button
                  class="character-action"
                  type="button"
                  data-edit-social-profile="${profile.id}"
                  title="Edit social profile"
                >
                  ✎
                </button>

                <button
                  class="character-action delete"
                  type="button"
                  data-delete-social-profile="${profile.id}"
                  title="Delete social profile"
                >
                  ×
                </button>
              </div>
            </article>
          `;
        })
        .join("")
    : `<p class="sidebar-help">No social profiles yet.</p>`;

  this.elements.socialProfileList
    .querySelectorAll("[data-edit-social-profile]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        this.openSocialProfileDialog(button.dataset.editSocialProfile);
      });
    });

  this.elements.socialProfileList
    .querySelectorAll("[data-delete-social-profile]")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        const profile = this.store.getSocialProfile(
          button.dataset.deleteSocialProfile
        );

        if (
          profile &&
          (await askConfirm(`Delete social profile "${profile.displayName}"?`, { confirmLabel: "Delete", danger: true }))
        ) {
          this.store.deleteSocialProfile(profile.id);
        }
      });
    });
}

renderNewspaperProfiles() {
  const profiles = Utils.safeArray(this.store.getState().newspaperProfiles);

  this.elements.newspaperProfileList.innerHTML = profiles.length
    ? profiles
        .map(
          (profile) => `
            <article draggable="true" class="profile-card">
              <div class="profile-card-main">
                <div
                  class="profile-card-icon"
                  style="background: ${Utils.escapeHtml(
                    profile.accentColor || "#8d1f1f"
                  )}; color: #ffffff"
                >
                  ▤
                </div>

                <div>
                  <div class="profile-card-name">
                    ${Utils.escapeHtml(profile.name || "Unnamed publication")}
                  </div>

                  <div class="profile-card-meta">
                    ${Utils.escapeHtml(profile.style || "broadsheet")}
                    ${profile.showAds ? " · ads enabled" : ""}
                  </div>
                </div>
              </div>

              <div class="character-actions">
                <button
                  class="character-action"
                  type="button"
                  data-edit-newspaper-profile="${profile.id}"
                  title="Edit publication"
                >
                  ✎
                </button>

                <button
                  class="character-action delete"
                  type="button"
                  data-delete-newspaper-profile="${profile.id}"
                  title="Delete publication"
                >
                  ×
                </button>
              </div>
            </article>
          `
        )
        .join("")
    : `<p class="sidebar-help">No newspaper publications yet.</p>`;

  this.elements.newspaperProfileList
    .querySelectorAll("[data-edit-newspaper-profile]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        this.openNewspaperProfileDialog(
          button.dataset.editNewspaperProfile
        );
      });
    });

  this.elements.newspaperProfileList
    .querySelectorAll("[data-delete-newspaper-profile]")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        const profile = this.store.getNewspaperProfile(
          button.dataset.deleteNewspaperProfile
        );

        if (profile && (await askConfirm(`Delete publication "${profile.name}"?`, { confirmLabel: "Delete", danger: true }))) {
          this.store.deleteNewspaperProfile(profile.id);
        }
      });
    });
}

  renderModuleWarningBadge(moduleId) {
    const issues = ReferenceChecker.getModuleIssues(
      this.store.getState(),
      moduleId
    );

    if (!issues.length) {
      return "";
    }

    const tooltip = issues.map((issue) => issue.message).join("\n");
    const label = `${issues.length} missing reference warning${
      issues.length === 1 ? "" : "s"
    }`;

    return `
      <span
        class="module-warning-badge"
        title="${Utils.escapeHtml(tooltip)}"
        aria-label="${Utils.escapeHtml(label)}"
      >
        ! ${issues.length}
      </span>
    `;
  }

  getModuleDisplayName(type) {
    const names = {
      "scene-heading": "Scene Heading",
      "note-card": "Note Card",
      "phone-thread": "Phone Thread",
      terminal: "Terminal / Console",
      "official-report": "Official Report",
      "handwritten-note": "Handwritten Note",
      "transaction-record": "Bank Statement / Receipt",
      "forum-post": "Forum Post",
      "evidence-media": "Evidence Photo / Media",
      "broken-link": "Broken Link",
      "email-document": "Email / Official Document",
      "social-media-post": "Social Media Post",
      "voice-message": "Voice Message",
      transcript: "Transcript",
      "newspaper-article": "Newspaper Article",
    };

    return names[type] || type;
  }

  getModuleIcon(type) {
    const icons = {
      "scene-heading": "T",
      "note-card": "▤",
      "phone-thread": "▣",
      terminal: ">_",
      "official-report": "▤",
      "handwritten-note": "✎",
      "transaction-record": "$",
      "forum-post": "#",
      "evidence-media": "▧",
      "broken-link": "!",
      "email-document": "✉",
      "social-media-post": "♥",
      "voice-message": "☎",
      transcript: "◖",
      "newspaper-article": "▤",
    };

    return icons[type] || "◫";
  }

  getModuleSummary(module) {
    const data = module.data || {};
    const summaries = {
      "scene-heading": data.title || data.subtitle,
      "note-card": data.title || data.label,
      "phone-thread":
        `${data.contactLabel || "Messages"} · ` +
        `${Utils.safeArray(data.messages).length} messages`,
      terminal: data.title || data.systemName,
      "official-report":
        `${data.reportType || "Official Report"} · ` +
        `${data.caseNumber || "No case number"}`,
      "handwritten-note": data.title || data.author,
      "transaction-record":
        `${data.documentType || "Transaction Record"} · ` +
        `${Utils.safeArray(data.transactions).length} entries`,
      "forum-post": data.title || data.boardName,
      "evidence-media": data.caption || data.altText || "Media evidence",
      "broken-link": data.headline || data.url,
      "email-document": data.subject || data.fromName,
      "social-media-post":
        data.content?.slice(0, 70) || "Social media post",
      "voice-message":
        `${data.callerName || "Unknown Caller"} · ${data.duration || "00:00"}`,
      transcript:
        `${data.title || "Transcript"} · ` +
        `${Utils.safeArray(data.speakers).length} speaker lines`,
      "newspaper-article": data.headline || data.section,
    };

    return summaries[module.type] || "Narrative module";
  }

  renderCollapsedModule(module) {
    const selectedClass =
      this.selectedModuleId === module.id ? "selected" : "";
    const summary = this.getModuleSummary(module.moduleData);
    const displayName = this.getModuleDisplayName(module.type);

    return `
      <article
        class="placed-module collapsed-module ${selectedClass}"
        data-module-id="${Utils.escapeHtml(module.id)}"
        tabindex="0"
        role="group"
        aria-label="${Utils.escapeHtml(`${displayName} module, collapsed`)}"
      >
        ${module.renderActions()}
        <div class="collapsed-module-content">
          <div class="collapsed-module-icon">${this.getModuleIcon(module.type)}</div>
          <div class="collapsed-module-copy">
            <strong>${Utils.escapeHtml(displayName)}</strong>
            <span>${Utils.escapeHtml(summary)}</span>
          </div>
          <div class="collapsed-module-state">COLLAPSED</div>
        </div>
      </article>
    `;
  }

  openModulePreview(moduleId) {
    const moduleData = this.store.getModule(moduleId);

    if (!moduleData || !this.elements.modulePreviewDialog) {
      return;
    }

    const previewModule = this.registry.createInstance(this, {
      ...moduleData,
      ui: {
        ...(moduleData.ui || {}),
        collapsed: false,
      },
    });
    const previewContainer = document.createElement("div");
    previewContainer.innerHTML = previewModule.render();
    previewContainer
      .querySelectorAll(".module-actions")
      .forEach((element) => element.remove());
    previewContainer.querySelectorAll(".placed-module").forEach((element) => {
      element.classList.remove("selected");
      element.removeAttribute("draggable");
      element.removeAttribute("tabindex");
      element.removeAttribute("role");
      element.removeAttribute("aria-label");
    });

    this.elements.modulePreviewBody.innerHTML = previewContainer.innerHTML;
    this.elements.modulePreviewSubtitle.textContent =
      this.getModuleDisplayName(moduleData.type);
    this.elements.modulePreviewDialog.showModal();
  }

  getProjectHealth() {
    const project = this.store.getState();
    const modules = Utils.safeArray(project.modules);
    const socialProfiles = Utils.safeArray(project.socialProfiles);
    const newspaperProfiles = Utils.safeArray(project.newspaperProfiles);
    const referenceIssues = ReferenceChecker.getMissingReferences(project);
    const moduleTypeCounts = modules.reduce((counts, module) => {
      counts[module.type] = (counts[module.type] || 0) + 1;
      return counts;
    }, {});

    const usedSocialProfileIds = new Set(
      modules
        .filter((module) => module.type === "social-media-post")
        .map((module) => module.data?.profileId)
        .filter(Boolean)
    );
    const usedNewspaperProfileIds = new Set(
      modules
        .filter((module) => module.type === "newspaper-article")
        .map((module) => module.data?.publicationId)
        .filter(Boolean)
    );

    const orphanSocialProfiles = socialProfiles.filter(
      (profile) => !usedSocialProfileIds.has(profile.id)
    );
    const orphanNewspaperProfiles = newspaperProfiles.filter(
      (profile) => !usedNewspaperProfileIds.has(profile.id)
    );
    const modulesWithMissingImageUrls = modules.filter((module) => {
      const data = module.data || {};

      if (module.type === "evidence-media") {
        return !data.imageUrl;
      }

      return (
        module.type === "social-media-post" &&
        Boolean(data.requireImage && !data.imageUrl)
      );
    });
    const missingRequiredContent = modules.filter((module) => {
      const data = module.data || {};

      if (module.type === "scene-heading") return !data.title;
      if (module.type === "phone-thread") {
        return !Utils.safeArray(data.messages).length;
      }
      if (module.type === "forum-post") return !data.title || !data.body;
      if (module.type === "newspaper-article") {
        return !data.headline || !data.body;
      }
      if (module.type === "voice-message") {
        return !data.callerName && !data.callerCharacterId;
      }
      if (module.type === "transcript") {
        return !data.title || !Utils.safeArray(data.speakers).length;
      }
      return false;
    });

    return {
      moduleCount: modules.length,
      characterCount: Utils.safeArray(project.characters).length,
      socialProfileCount: socialProfiles.length,
      newspaperProfileCount: newspaperProfiles.length,
      moduleTypeCounts,
      referenceIssues,
      orphanSocialProfiles,
      orphanNewspaperProfiles,
      modulesWithMissingImageUrls,
      missingRequiredContent,
    };
  }

  renderProjectHealth() {
    const panel = this.elements.projectHealthPanel;

    if (!panel) {
      return;
    }

    const health = this.getProjectHealth();
    const issueCount =
      health.referenceIssues.length +
      health.modulesWithMissingImageUrls.length +
      health.missingRequiredContent.length;
    const cleanupCount =
      health.orphanSocialProfiles.length +
      health.orphanNewspaperProfiles.length;
    const severityClass = issueCount
      ? "has-errors"
      : cleanupCount
        ? "has-warnings"
        : "is-healthy";
    const moduleBreakdown = Object.entries(health.moduleTypeCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([type, count]) => `
          <div class="project-health-type-row">
            <span>${Utils.escapeHtml(this.getModuleDisplayName(type))}</span>
            <strong>${count}</strong>
          </div>
        `
      )
      .join("");
    const referenceList = health.referenceIssues.length
      ? health.referenceIssues
          .slice(0, 6)
          .map(
            (issue) => `
              <li>
                <button
                  type="button"
                  class="health-issue-link"
                  data-select-module="${Utils.escapeHtml(issue.moduleId)}"
                >
                  ${Utils.escapeHtml(issue.message)}
                </button>
              </li>
            `
          )
          .join("")
      : `<li class="health-ok">No missing profile or character references.</li>`;

    panel.innerHTML = `
      <div class="project-health-summary ${severityClass}">
        <div class="project-health-score">
          ${
            issueCount
              ? `${issueCount} issue${issueCount === 1 ? "" : "s"}`
              : cleanupCount
                ? `${cleanupCount} cleanup item${cleanupCount === 1 ? "" : "s"}`
                : "Healthy"
          }
        </div>
        <div class="project-health-description">
          ${health.moduleCount} modules · ${health.characterCount} characters ·
          ${health.socialProfileCount} social profiles ·
          ${health.newspaperProfileCount} publications
        </div>
      </div>
      <div class="project-health-section">
        <div class="project-health-section-title">Module Breakdown</div>
        <div class="project-health-type-list">
          ${
            moduleBreakdown ||
            `<div class="project-health-empty">No modules added.</div>`
          }
        </div>
      </div>
      <div class="project-health-section">
        <div class="project-health-section-title">Reference Problems</div>
        <ul class="project-health-issue-list">${referenceList}</ul>
      </div>
      <div class="project-health-section">
        <div class="project-health-section-title">Cleanup Opportunities</div>
        <div class="project-health-cleanup-line">
          Unused social profiles: <strong>${health.orphanSocialProfiles.length}</strong>
        </div>
        <div class="project-health-cleanup-line">
          Unused publications: <strong>${health.orphanNewspaperProfiles.length}</strong>
        </div>
        <div class="project-health-cleanup-line">
          Missing media URLs: <strong>${health.modulesWithMissingImageUrls.length}</strong>
        </div>
        <div class="project-health-cleanup-line">
          Incomplete modules: <strong>${health.missingRequiredContent.length}</strong>
        </div>
      </div>
    `;

    panel.querySelectorAll("[data-select-module]").forEach((button) => {
      button.addEventListener("click", () => {
        this.selectModule(button.dataset.selectModule);
        this.setSidebarTab("modules");
      });
    });
  }

  renderCanvas() {
    const modules = this.store.getState().modules;

    if (!modules.length) {
      this.elements.canvas.innerHTML = `
        <div class="canvas-empty">
          <h2>Your story canvas is empty</h2>
          <p>
            Add a phone thread, heading, or note from the sidebar to start
            composing an interactive narrative.
          </p>
        </div>
      `;
      return;
    }

    this.elements.canvas.innerHTML = modules
      .map((moduleData) => {
        const module = this.registry.createInstance(this, moduleData);
        if (moduleData.ui?.collapsed) {
          return this.renderCollapsedModule(module);
        }
        return module.render();
      })
      .join("");

    this.elements.canvas.querySelectorAll("[data-module-id]").forEach((element) => {
      const moduleId = element.dataset.moduleId;
      const moduleData = this.store.getModule(moduleId);

      if (!moduleData) {
        return;
      }

      element.draggable = true;
      element.tabIndex = 0;
      element.setAttribute("role", "group");
      element.setAttribute(
        "aria-label",
        `${this.getModuleDisplayName(moduleData.type)} module${
          moduleData.ui?.collapsed ? ", collapsed" : ""
        }`
      );

      const module = this.registry.createInstance(this, moduleData);
      this.applyStyleOverrides(element, module);
      module.bindCanvasEvents(element);
    });
  }

  applyStyleOverrides(element, module) {
    const css = module.getStyleOverrideCss();
    if (!css) {
      return;
    }

    css.split(";").forEach((declaration) => {
      const [name, ...rest] = declaration.split(":");
      element.style.setProperty(name.trim(), rest.join(":").trim());
    });

    if (module.moduleData.styleOverrides?.backgroundColor) {
      element.classList.add("has-custom-background");
    }
  }

  renderInspector() {
    const selectedModule = this.getSelectedModule();

    if (!selectedModule) {
      this.elements.inspectorSubtitle.textContent = "Select a module to edit it";
      this.elements.inspectorBody.innerHTML = `
        <div class="empty-inspector">
          <div class="empty-inspector-icon">◫</div>
          <p>Select a story module on the canvas.</p>
        </div>
      `;
      return;
    }

    const module = this.registry.createInstance(this, selectedModule);
    const body = this.elements.inspectorBody;
    const active = document.activeElement;
    let focusState = null;

    if (active && body.contains(active)) {
      const controls = [...body.querySelectorAll("input, textarea, select, button")];
      focusState = {
        moduleId: selectedModule.id,
        index: controls.indexOf(active),
        start: active.selectionStart,
        end: active.selectionEnd,
        scrollTop: body.scrollTop,
      };
    }

    this.elements.inspectorSubtitle.textContent = `${selectedModule.type} selected`;
    body.innerHTML =
      module.renderInspector() + this.renderMetaEditor(selectedModule);
    module.bindInspectorEvents(body);
    this.bindMetaEditor(body, selectedModule.id);

    if (focusState && focusState.moduleId === this.lastInspectorModuleId) {
      const controls = [...body.querySelectorAll("input, textarea, select, button")];
      const target = controls[focusState.index];

      if (target) {
        target.focus({ preventScroll: true });
        if (focusState.start != null) {
          try {
            target.setSelectionRange(focusState.start, focusState.end);
          } catch (error) {
            /* non-text input */
          }
        }
        body.scrollTop = focusState.scrollTop;
      }
    }

    this.lastInspectorModuleId = selectedModule.id;
  }

  openCharacterDialog(characterId = null) {
    this.editingCharacterId = characterId;

    const template = document.querySelector("#character-form-template");
    const form = template.content.cloneNode(true);
    const character = characterId ? this.store.getCharacter(characterId) : null;

    this.elements.characterDialogTitle.textContent = character
      ? `Edit ${character.name}`
      : "Create Character";

    this.elements.characterDialogBody.innerHTML = "";
    this.elements.characterDialogBody.appendChild(form);

    const dialogBody = this.elements.characterDialogBody;

    dialogBody.querySelector("#character-name").value = character?.name || "";
    dialogBody.querySelector("#character-short-name").value =
      character?.shortName || "";
    dialogBody.querySelector("#character-color").value =
      character?.primaryColor || "#f4a6c8";
    dialogBody.querySelector("#character-color-soft").value =
      character?.softColor || "#ffe3ee";
    dialogBody.querySelector("#character-avatar").value =
      character?.avatar || "";

    this.elements.characterDialog.showModal();
  }

  saveCharacterFromDialog() {
    const dialogBody = this.elements.characterDialogBody;

    const name = dialogBody.querySelector("#character-name").value.trim();
    const shortName = dialogBody
      .querySelector("#character-short-name")
      .value.trim()
      .toUpperCase();
    const primaryColor = dialogBody.querySelector("#character-color").value;
    const softColor = dialogBody.querySelector("#character-color-soft").value;
    const avatar = dialogBody
      .querySelector("#character-avatar")
      .value.trim()
      .toUpperCase();

    if (!name) {
      notifyUser("Character name is required.");
      return;
    }

    const characterData = {
      name,
      shortName: shortName || name.slice(0, 3).toUpperCase(),
      primaryColor,
      softColor,
      avatar: avatar || name.charAt(0).toUpperCase(),
    };

    if (this.editingCharacterId) {
      this.store.updateCharacter(this.editingCharacterId, characterData);
    } else {
      this.store.addCharacter({
        id: Utils.uid("character"),
        ...characterData,
      });
    }

    this.elements.characterDialog.close();
  }
  openSocialProfileDialog(profileId = null) {
  this.editingSocialProfileId = profileId;

  const template = document.querySelector(
    "#social-profile-form-template"
  );

  const form = template.content.cloneNode(true);

  const profile = profileId
    ? this.store.getSocialProfile(profileId)
    : null;

  this.elements.socialProfileDialogTitle.textContent = profile
    ? `Edit ${profile.displayName}`
    : "Create Social Profile";

  this.elements.socialProfileDialogBody.innerHTML = "";
  this.elements.socialProfileDialogBody.appendChild(form);

  const body = this.elements.socialProfileDialogBody;

  const ownerSelect = body.querySelector("#social-profile-owner");

  ownerSelect.innerHTML = [
    `<option value="">No linked character</option>`,
    ...this.store.getState().characters.map(
      (character) => `
        <option value="${character.id}">
          ${Utils.escapeHtml(character.name)}
        </option>
      `
    ),
  ].join("");

  body.querySelector("#social-profile-display-name").value =
    profile?.displayName || "";

  body.querySelector("#social-profile-handle").value =
    profile?.handle || "";

  body.querySelector("#social-profile-platform").value =
    profile?.platform || "microblog";

  ownerSelect.value = profile?.ownerCharacterId || "";

  body.querySelector("#social-profile-avatar").value =
    profile?.avatar || "";

  body.querySelector("#social-profile-followers").value =
    profile?.followerLabel || "";

  body.querySelector("#social-profile-primary-color").value =
    profile?.primaryColor || "#6c7c95";

  body.querySelector("#social-profile-soft-color").value =
    profile?.softColor || "#dfe6ef";

  body.querySelector("#social-profile-bio").value =
    profile?.bio || "";

  this.elements.socialProfileDialog.showModal();
}

saveSocialProfileFromDialog() {
  const body = this.elements.socialProfileDialogBody;

  const displayName = body
    .querySelector("#social-profile-display-name")
    .value.trim();

  if (!displayName) {
    notifyUser("A social profile needs a display name.");
    return;
  }

  const profileData = {
    displayName,
    handle: body.querySelector("#social-profile-handle").value.trim(),
    platform: body.querySelector("#social-profile-platform").value,
    ownerCharacterId: body.querySelector("#social-profile-owner").value,
    avatar: body
      .querySelector("#social-profile-avatar")
      .value.trim()
      .toUpperCase(),
    followerLabel: body
      .querySelector("#social-profile-followers")
      .value.trim(),
    primaryColor: body.querySelector("#social-profile-primary-color").value,
    softColor: body.querySelector("#social-profile-soft-color").value,
    bio: body.querySelector("#social-profile-bio").value.trim(),
  };

  if (this.editingSocialProfileId) {
    this.store.updateSocialProfile(
      this.editingSocialProfileId,
      profileData
    );
  } else {
    this.store.addSocialProfile({
      id: Utils.uid("social"),
      ...profileData,
    });
  }

  this.elements.socialProfileDialog.close();
}

openNewspaperProfileDialog(profileId = null) {
  this.editingNewspaperProfileId = profileId;

  const template = document.querySelector(
    "#newspaper-profile-form-template"
  );

  const form = template.content.cloneNode(true);

  const profile = profileId
    ? this.store.getNewspaperProfile(profileId)
    : null;

  this.elements.newspaperProfileDialogTitle.textContent = profile
    ? `Edit ${profile.name}`
    : "Create Newspaper Publication";

  this.elements.newspaperProfileDialogBody.innerHTML = "";
  this.elements.newspaperProfileDialogBody.appendChild(form);

  const body = this.elements.newspaperProfileDialogBody;

  body.querySelector("#newspaper-profile-name").value =
    profile?.name || "";

  body.querySelector("#newspaper-profile-style").value =
    profile?.style || "broadsheet";

  body.querySelector("#newspaper-profile-masthead-color").value =
    profile?.mastheadColor || "#1b1b1b";

  body.querySelector("#newspaper-profile-accent-color").value =
    profile?.accentColor || "#8d1f1f";

  body.querySelector("#newspaper-profile-city-line").value =
    profile?.cityLine || "";

  body.querySelector("#newspaper-profile-slogan").value =
    profile?.slogan || "";

  body.querySelector("#newspaper-profile-show-ads").checked =
    Boolean(profile?.showAds);

  this.elements.newspaperProfileDialog.showModal();
}

saveNewspaperProfileFromDialog() {
  const body = this.elements.newspaperProfileDialogBody;

  const name = body
    .querySelector("#newspaper-profile-name")
    .value.trim();

  if (!name) {
    notifyUser("A newspaper publication needs a name.");
    return;
  }

  const profileData = {
    name,
    style: body.querySelector("#newspaper-profile-style").value,
    mastheadColor: body.querySelector(
      "#newspaper-profile-masthead-color"
    ).value,
    accentColor: body.querySelector(
      "#newspaper-profile-accent-color"
    ).value,
    cityLine: body.querySelector("#newspaper-profile-city-line").value.trim(),
    slogan: body.querySelector("#newspaper-profile-slogan").value.trim(),
    showAds: body.querySelector("#newspaper-profile-show-ads").checked,
  };

  if (this.editingNewspaperProfileId) {
    this.store.updateNewspaperProfile(
      this.editingNewspaperProfileId,
      profileData
    );
  } else {
    this.store.addNewspaperProfile({
      id: Utils.uid("publication"),
      ...profileData,
    });
  }

  this.elements.newspaperProfileDialog.close();
}
}
/* -------------------------------------------------------------------------- */
/* DEMO DATA                                                                   */
/* -------------------------------------------------------------------------- */

/* In-page replacements for alert/confirm, which can leave inputs unfocusable in embedded browsers. */
function notifyUser(message) {
  if (window.narrativeEditor?.showToast) {
    window.narrativeEditor.showToast(message, "error");
  } else {
    console.warn(message);
  }
}

function askConfirm(message, { confirmLabel = "Confirm", danger = false } = {}) {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const dialog = document.createElement("dialog");
    dialog.className = "modal confirm-dialog";
    dialog.setAttribute("aria-label", "Please confirm");
    dialog.innerHTML = `
      <div class="modal-card">
        <p class="confirm-message"></p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" data-confirm="cancel">Cancel</button>
          <button type="button" class="btn ${danger ? "btn-danger" : "btn-cyan"}" data-confirm="ok"></button>
        </div>
      </div>
    `;
    dialog.querySelector(".confirm-message").textContent = message;
    dialog.querySelector("[data-confirm=ok]").textContent = confirmLabel;

    let answer = false;
    dialog.addEventListener("click", (event) => {
      const choice = event.target.closest("[data-confirm]")?.dataset.confirm;
      if (choice) {
        answer = choice === "ok";
        dialog.close();
      }
    });
    dialog.addEventListener("close", () => {
      dialog.remove();
      previousFocus?.focus?.();
      resolve(answer);
    });

    document.body.appendChild(dialog);
    dialog.showModal();
    dialog.querySelector("[data-confirm=cancel]").focus();
  });
}

function createDemoProject() {
  const ashley = {
    id: "char-ashley",
    name: "Ashley",
    shortName: "ASH",
    avatar: "A",
    primaryColor: "#ec7fae",
    softColor: "#ffe0ed",
  };

  const rob = {
    id: "char-rob",
    name: "Rob",
    shortName: "ROB",
    avatar: "R",
    primaryColor: "#5b9df6",
    softColor: "#dceaff",
  };

  const miles = {
    id: "char-miles",
    name: "Miles",
    shortName: "MIL",
    avatar: "M",
    primaryColor: "#7fc99a",
    softColor: "#ddf8e7",
  };

  return {
    version: 3,
    title: "The Blackwater Archive",
    characters: [ashley, rob, miles],
    socialProfiles: [],
    newspaperProfiles: [],
    modules: [
      {
        id: "module-heading-demo",
        type: "scene-heading",
        data: {
          kicker: "Chapter One",
          title: "The Message That Shouldn't Exist",
          subtitle: "Framingham, Massachusetts — October 2004",
        },
      },
      {
        id: "module-rob-phone",
        type: "phone-thread",
        data: {
          ownerCharacterId: rob.id,
          contactLabel: "Ashley",
          subtitle: "iMessage",
          dateLabel: "Thursday, 11:42 PM",
          theme: "dark",
          messages: [
            {
              id: "msg-1",
              senderCharacterId: ashley.id,
              text: "Rob, are you still awake?",
              time: "11:42 PM",
            },
            {
              id: "msg-2",
              senderCharacterId: rob.id,
              text: "Yeah. What's wrong?",
              time: "11:43 PM",
            },
            {
              id: "msg-3",
              senderCharacterId: ashley.id,
              text: "I got another photo from the number that disappeared last week.",
              time: "11:43 PM",
            },
            {
              id: "msg-4",
              senderCharacterId: rob.id,
              text: "Don't send it here. Meet me at the archive.",
              time: "11:44 PM",
            },
          ],
        },
      },
      {
        id: "module-ashley-phone",
        type: "phone-thread",
        data: {
          ownerCharacterId: ashley.id,
          contactLabel: "Rob",
          subtitle: "Messages",
          dateLabel: "Later That Night",
          theme: "light",
          messages: [
            {
              id: "msg-5",
              senderCharacterId: rob.id,
              text: "You brought the photograph, right?",
              time: "12:18 AM",
            },
            {
              id: "msg-6",
              senderCharacterId: ashley.id,
              text: "Yes. And I found something written on the back.",
              time: "12:19 AM",
            },
            {
              id: "msg-7",
              senderCharacterId: miles.id,
              text: "Stop texting about it. They're monitoring the line.",
              time: "12:20 AM",
            },
          ],
        },
      },
      {
        id: "module-note-demo",
        type: "note-card",
        data: {
          label: "Recovered Evidence",
          title: "Note found inside cassette case",
          body: "The person in the photograph is not Ashley. Do not let her see this.",
        },
      },
    ],
  };
}
/* -------------------------------------------------------------------------- */
/* BOOTSTRAP                                                                   */
/* -------------------------------------------------------------------------- */

const registry = new ModuleRegistry();

/* Core layout modules */
registry.register(PhoneThreadModule);
registry.register(SceneHeadingModule);
registry.register(NoteCardModule);

/* Evidence / document modules */
registry.register(TerminalModule);
registry.register(OfficialReportModule);
registry.register(HandwrittenNoteModule);
registry.register(TransactionRecordModule);
registry.register(ForumPostModule);
registry.register(TranscriptModule);
registry.register(VoiceMessageModule);

/* Legacy/re-added media modules */
registry.register(EvidenceMediaModule);
registry.register(BrokenLinkModule);
registry.register(EmailDocumentModule);
registry.register(SocialMediaPostModule);
registry.register(NewspaperArticleModule); 

/* Defensive startup validation */
const requiredModuleTypes = [
  "phone-thread",
  "scene-heading",
  "note-card",
  "terminal",
  "official-report",
  "handwritten-note",
  "transaction-record",
  "forum-post",
  "transcript",
  "voice-message",
  "evidence-media",
  "broken-link",
  "email-document",
  "social-media-post",
  "newspaper-article",
];

requiredModuleTypes.forEach((type) => {
  if (!registry.modules.has(type)) {
    console.error(
      `[Narrative Editor] Module type "${type}" was not registered. ` +
      `Check its class name, static type getter, and registry.register() call.`
    );
  }
});

const store = new ProjectStore(createDemoProject());

const editor = new NarrativeEditor(store, registry);
const autosave = new AutosaveManager(store, {
  onStatusChange(status) {
    const saveStatus = document.querySelector("#save-status");
    const labels = {
      saving: "Saving locally...",
      saved: "Saved locally",
      error: "Autosave failed",
      cleared: "Local autosave cleared",
    };

    if (saveStatus) {
      saveStatus.textContent = labels[status] || "Local project state";
    }
  },
});

const savedProject = autosave.load();

if (savedProject) {
  const validation = ProjectValidator.validate(savedProject, registry);

  if (validation.valid) {
    store.replaceProject(savedProject, { recordHistory: false });
  } else {
    console.error(
      "[Autosave] Saved project is invalid; starting with the demo project.",
      validation.errors
    );
  }
}

window.narrativeEditor = editor;
window.narrativeStore = store;
window.narrativeRegistry = registry;
window.narrativeAutosave = autosave;

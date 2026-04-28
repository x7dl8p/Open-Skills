import * as vscode from "vscode";
import * as path from "path";
import { GapAnalysisResult, SkillDefinition, SkillStatus } from "../types";

interface SkillAnalytics {
  totalInstalled: number;
  totalDeleted: number;
  totalImported: number;
  lastScanDate: string;
}

export class GapAnalysisPanel {
  public static currentPanel: GapAnalysisPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private readonly onImport: (skill: SkillDefinition) => Promise<void>;
  private readonly onRefresh?: () => void;

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    onImport: (skill: SkillDefinition) => Promise<void>,
    onRefresh?: () => void,
  ) {
    this.panel = panel;
    this.context = context;
    this.onImport = onImport;
    this.onRefresh = onRefresh;

    this.panel.onDidDispose(() => {
      GapAnalysisPanel.currentPanel = undefined;
    });

    this.panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "import" && msg.skill) {
        await this.onImport(msg.skill as SkillDefinition);
        this.onRefresh?.();
      } else if (msg.type === "refresh") {
        this.onRefresh?.();
      } else if (msg.type === "fetchAll") {
        vscode.commands.executeCommand("open-skills.fetchAllMarketplace");
      }
    });
  }

  static createOrShow(
    context: vscode.ExtensionContext,
    result: GapAnalysisResult,
    onImport: (skill: SkillDefinition) => Promise<void>,
    analytics?: SkillAnalytics,
    marketplaceCount?: number,
    hasErrors?: boolean,
    repoStats?: { loaded: number; total: number },
    onRefresh?: () => void,
  ): void {
    if (GapAnalysisPanel.currentPanel) {
      GapAnalysisPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
      GapAnalysisPanel.currentPanel.update(result, analytics, marketplaceCount, hasErrors, repoStats);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "openSkills.gapAnalysis",
      "Dashboard — Open Skills",
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    GapAnalysisPanel.currentPanel = new GapAnalysisPanel(
      panel,
      context,
      onImport,
      onRefresh,
    );
    GapAnalysisPanel.currentPanel.update(result, analytics, marketplaceCount, hasErrors, repoStats);
    context.subscriptions.push(panel);
  }

  update(result: GapAnalysisResult, analytics?: SkillAnalytics, marketplaceCount?: number, hasErrors?: boolean, repoStats?: { loaded: number; total: number }): void {
    this.panel.webview.html = this.buildHtml(result, analytics, marketplaceCount, hasErrors, repoStats);
  }

  private buildHtml(result: GapAnalysisResult, analytics?: SkillAnalytics, marketplaceCount?: number, hasErrors?: boolean, repoStats?: { loaded: number; total: number }): string {
    const { present, missing, coveragePercentage } = result;

    const logoPath = vscode.Uri.file(
      path.join(this.context.extensionPath, "assets", "open-skills.png")
    );
    const logoUri = this.panel.webview.asWebviewUri(logoPath);

    const barColor =
      coveragePercentage >= 75
        ? "var(--vscode-testing-iconPassed)"
        : coveragePercentage >= 40
          ? "var(--vscode-editorWarning-foreground)"
          : "var(--vscode-editorError-foreground)";

    const installed = analytics?.totalInstalled ?? 0;
    const deleted = analytics?.totalDeleted ?? 0;
    const imported = analytics?.totalImported ?? 0;
    const lastScan = analytics?.lastScanDate
      ? new Date(analytics.lastScanDate).toLocaleString()
      : "Never";
    const mpCount = marketplaceCount ?? 0;

    const missingRows = missing.map(s => this.buildRow(s, "import-workspace", "Import to Workspace")).join("");
    const presentRows = present.map(s =>
      s.isSynced
        ? this.buildBadgeRow(s, "In Library")
        : this.buildRow(s, "add-library", "Add to Library")
    ).join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Open Skills Dashboard</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 32px 48px;
      max-width: 960px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 8px;
    }
    .logo {
      width: 40px;
      height: 40px;
      object-fit: contain;
    }
    h1 { font-size: 24px; font-weight: 600; margin: 0; }
    .subtitle { color: var(--vscode-descriptionForeground); margin-bottom: 32px; font-size: 14px; }
    .analytics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
      margin-bottom: 32px;
    }
    .analytics-card {
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 16px 20px;
      text-align: center;
    }
    .analytics-card .value {
      font-size: 32px;
      font-weight: 700;
      display: block;
      margin-bottom: 4px;
      color: var(--vscode-foreground);
    }
    .analytics-card .label {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .coverage-bar-wrap {
      margin-bottom: 32px;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-panel-border);
      padding: 16px;
      border-radius: 8px;
    }
    .coverage-label {
      display: flex;
      justify-content: space-between;
      margin-bottom: 12px;
      font-weight: 600;
      font-size: 14px;
    }
    .bar-bg {
      height: 10px;
      background: var(--vscode-panel-border);
      border-radius: 5px;
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      background: ${barColor};
      transition: width 0.6s cubic-bezier(0.23, 1, 0.32, 1);
    }
    .section-title {
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      margin: 32px 0 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 8px;
    }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { text-align: left; padding: 12px 8px; font-size: 12px; color: var(--vscode-descriptionForeground); }
    td { padding: 14px 8px; border-bottom: 1px solid var(--vscode-panel-border); vertical-align: middle; }
    .vscode-button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 14px;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
    }
    .vscode-button:hover { background: var(--vscode-button-hoverBackground); }
    .badge-ok {
      background: var(--vscode-testing-iconPassed);
      color: #fff;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
    code {
      font-family: var(--vscode-editor-font-family);
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 4px;
      border-radius: 3px;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div style="display: flex; align-items: center; gap: 16px; flex: 1;">
      <img src="${logoUri}" alt="Open Skills" class="logo">
      <div>
        <h1>Open Skills Dashboard</h1>
        <p class="subtitle" style="margin-bottom: 0;">Unified view of your workspace skills, gaps, and marketplace analytics.</p>
      </div>
    </div>
    <button class="vscode-button" id="refresh-all" style="background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M13.6 2.3C12.2.9 10.2 0 8 0 3.6 0 0 3.6 0 8s3.6 8 8 8c3.7 0 6.8-2.5 7.7-6h-2.1c-.8 2.3-3 4-5.6 4-3.3 0-6-2.7-6-6s2.7-6 6-6c1.7 0 3.1.7 4.2 1.8L10 6h6V0l-2.4 2.3z"/></svg>
      Refresh
    </button>
  </div>

  <div class="analytics-grid">
    <div class="analytics-card" style="position: relative;">
      ${repoStats && repoStats.loaded < repoStats.total
        ? `
          <span class="value" style="color: var(--vscode-descriptionForeground); font-size: 24px;">${repoStats.loaded}/${repoStats.total}</span>
          <span class="label">Repos Loaded</span>
          <div style="margin-top: 8px;">
            <button class="vscode-button" id="fetch-all-mp" style="padding: 2px 8px; font-size: 10px;">Fetch Marketplace</button>
          </div>
        `
        : `
          <span class="value">${mpCount}</span>
          <span class="label">Available in Marketplace</span>
        `
      }
    </div>
    <div class="analytics-card">
      <span class="value">${installed}</span>
      <span class="label">Installed Lifetime</span>
    </div>
    <div class="analytics-card">
      <span class="value">${imported}</span>
      <span class="label">Imported Lifetime</span>
    </div>
    <div class="analytics-card">
      <span class="value">${present.length}</span>
      <span class="label">Active in Workspace</span>
    </div>
  </div>

  ${hasErrors
        ? `
    <div class="coverage-bar-wrap" style="text-align: center; background: rgba(255, 152, 0, 0.1); border-color: var(--vscode-editorWarning-foreground); margin-bottom: 32px;">
      <div style="font-size: 16px; font-weight: 600; color: var(--vscode-editorWarning-foreground); display: flex; align-items: center; justify-content: center; gap: 8px;">
        <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M7.561 2.03a1 1 0 0 1 1.788 0l5.855 10.59a1 1 0 0 1-.894 1.48H2.6a1 1 0 0 1-.894-1.48L7.561 2.03zM8 5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 1 0v-3A.5.5 0 0 0 8 5zm0 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/></svg>
        Marketplace partially unavailable
      </div>
      <div style="font-size: 13px; color: var(--vscode-foreground); margin-top: 4px;">
        Some repositories failed to load (most likely GitHub rate limiting), Try again later 
      </div>
    </div>
    `
        : ''
      }

  <div class="coverage-bar-wrap">
    <div class="coverage-label">
      <span>Workspace Skill Coverage</span>
      <span>${coveragePercentage}%</span>
    </div>
    <div class="bar-bg">
      <div class="bar-fill" style="width: ${coveragePercentage}%"></div>
    </div>
    <div style="font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 12px; opacity: 0.8;">
      Workspace Skills: <strong>${present.length}</strong> | 
      Missing: <strong>${missing.length}</strong> | 
      Total Marketplace: <strong>${mpCount}</strong> | 
      Last Scan: ${lastScan}
    </div>
  </div>

  ${missing.length > 0
        ? `
    <div class="section-title">Missing Skills (${missing.length})</div>
    <table>
      <thead>
        <tr>
          <th style="width: 15%">Name</th>
          <th style="width: 25%">Source</th>
          <th style="width: 45%">Description</th>
          <th style="width: 15%">Action</th>
        </tr>
      </thead>
      <tbody>
        ${missingRows}
      </tbody>
    </table>
  `
        : !hasErrors
          ? `
    <div class="coverage-bar-wrap" style="text-align: center; background: rgba(76, 175, 80, 0.1); border-color: var(--vscode-testing-iconPassed);">
      <div style="font-size: 16px; font-weight: 600; color: var(--vscode-testing-iconPassed); display: flex; align-items: center; justify-content: center; gap: 8px;">
        <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>
        All skills are up to date!
      </div>
      <div style="font-size: 13px; color: var(--vscode-foreground); margin-top: 4px;">
        Your workspace matches the global library and standard definitions.
      </div>
    </div>
    `
          : `
    <div class="coverage-bar-wrap" style="text-align: center; background: rgba(255, 152, 0, 0.05); border-color: var(--vscode-panel-border);">
      <div style="font-size: 15px; font-weight: 600; color: var(--vscode-descriptionForeground); display: flex; align-items: center; justify-content: center; gap: 8px;">
        No missing skills found in available sources
      </div>
      <div style="font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 4px;">
        Some sources could not be reached, so this list might be incomplete.
      </div>
    </div>
    `
      }

  <div class="section-title">Active Skills (${present.length})</div>
  <table>
    <thead>
      <tr>
        <th style="width: 15%">Name</th>
        <th style="width: 25%">Source</th>
        <th style="width: 45%">Description</th>
        <th style="width: 15%">Action</th>
      </tr>
    </thead>
    <tbody>
      ${presentRows}
    </tbody>
  </table>

  <script>
    const vscode = acquireVsCodeApi();
    const LOADING_LABELS = {
      'import-workspace': 'Importing...',
      'add-library': 'Adding...'
    };
    document.querySelectorAll('.vscode-button[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const skill = JSON.parse(btn.getAttribute('data-skill'));
        const action = btn.getAttribute('data-action');
        btn.disabled = true;
        btn.textContent = LOADING_LABELS[action] || 'Working...';
        vscode.postMessage({ type: 'import', skill });
      });
    });

    document.getElementById('refresh-all')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'refresh' });
    });

    document.getElementById('fetch-all-mp')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'fetchAll' });
    });
  </script>
</body>
</html>`;
  }

  private buildRow(skill: SkillDefinition, action: string, label: string): string {
    const desc = skill.description.length > 80
      ? this.esc(skill.description.substring(0, 80)) + "…"
      : this.esc(skill.description);
    return `
      <tr>
        <td>${this.esc(skill.name)}</td>
        <td><code>${this.esc(skill.source)}</code></td>
        <td>${desc}</td>
        <td>
          <button class="vscode-button" data-action="${action}" data-skill='${JSON.stringify(skill).replace(/'/g, "&#39;")}'>
            ${label}
          </button>
        </td>
      </tr>`;
  }

  private buildBadgeRow(skill: SkillDefinition, label: string): string {
    const desc = skill.description.length > 80
      ? this.esc(skill.description.substring(0, 80)) + "…"
      : this.esc(skill.description);
    return `
      <tr>
        <td>${this.esc(skill.name)}</td>
        <td><code>${this.esc(skill.source)}</code></td>
        <td>${desc}</td>
        <td><span class="badge-ok">${this.esc(label)}</span></td>
      </tr>`;
  }

  private esc(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}

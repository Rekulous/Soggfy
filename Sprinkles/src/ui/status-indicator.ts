import config from "../config"
import { Connection, MessageType } from "../connection";
import { Icons, Selectors } from "./ui";
import Utils from "../utils";
import { TemplatedSearchTree } from "../path-template";

export enum DownloadStatus
{
    ERROR       = "ERROR",
    IN_PROGRESS = "IN_PROGRESS",
    CONVERTING  = "CONVERTING",
    WARN        = "WARN",
    DONE        = "DONE"
}
export interface TrackStatus
{
    status: DownloadStatus,
    path?: string; //if status == DONE
    message?: string;
}
//From https://fonts.google.com/icons
const StatusIcons = {
    [DownloadStatus.ERROR]: Icons.Error,
    [DownloadStatus.IN_PROGRESS]: Icons.InProgress,
    [DownloadStatus.CONVERTING]: Icons.Processing,
    [DownloadStatus.WARN]: Icons.Warning,
    [DownloadStatus.DONE]: Icons.Done
};

export class StatusIndicator
{
    private _conn: Connection;
    private _obs: MutationObserver;

    constructor(con: Connection)
    {
        this._conn = con;

        this._obs = new MutationObserver((mutations) => {
            let dirtyRows = [];
            for (let mut of mutations) {
                for (let node of mut.addedNodes) {
                    if (node.parentElement?.matches('div[role="presentation"]:not([class])') && (node as Element).matches('div[role="row"]')) {
                        dirtyRows.push(node.firstChild);
                    }
                }
            }
            if (dirtyRows.length > 0) {
                this.sendUpdateRequest(dirtyRows);
            }
        });
        let container = document.querySelector(".main-view-container__scroll-node-child");
        this._obs.observe(container, {
            subtree: true,
            childList: true
        });
    }

    updateRows(map: { [uri: string]: TrackStatus })
    {
        //TODO: find a better way to extract data from playlist rows
        let listSection = document.querySelector('section[data-testid="playlist-page"],[data-testid="album-page"]');
        if (!listSection) return;

        let listDiv = listSection.querySelector('div[tabindex="0"]');
        let listDivRows = listDiv.querySelector('div[role="presentation"]:not([class])');

        for (let rowWrapper of listDivRows.children) {
            let row = rowWrapper.firstElementChild;
            let trackInfo = this.getRowTrackInfo(row, listSection);
            let info = map[trackInfo?.uri];
            if (!info) continue;
            
            let node = row["__sgf_status_ind"] ??= document.createElement("div");
            if (!node.parentElement) {
                let infoColDiv = row.lastElementChild;
                infoColDiv.prepend(node);
            }
            
            node.className = "sgf-status-indicator";
            node.innerHTML = `
<div class="sgf-status-indicator-card">
${info.status == DownloadStatus.DONE
    ? `
    <div class="sgf-status-browse-button">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="#ddd">
            <path xmlns="http://www.w3.org/2000/svg" d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"></path>
        </svg>
        <span style="padding-left: 4px; font-size: 16px; color: #ddd;">Open Folder</span>
    </div>`
    : `
    <span style="font-size: 16px; color: #ddd;">${info.message}</span>
`}
</div>
${StatusIcons[info.status]}`;

            let browseBtn: HTMLDivElement = node.querySelector(".sgf-status-browse-button");
            if (browseBtn) {
                browseBtn.onclick = () => {
                    this._conn.send(MessageType.OPEN_FOLDER, { path: info.path });
                };
            }
        }
    }
    private async sendUpdateRequest(dirtyRows: HTMLDivElement[])
    {
        let listSection = document.querySelector('section[data-testid="playlist-page"],[data-testid="album-page"]');
        if (!listSection) return;

        let tree = new TemplatedSearchTree(config.savePaths.track);

        for (let row of dirtyRows) {
            let trackInfo = this.getRowTrackInfo(row, listSection);
            if (trackInfo) {
                tree.add(trackInfo.uri, trackInfo.vars);
            }
        }
        this._conn.send(MessageType.DOWNLOAD_STATUS, {
            searchTree: tree.root,
            basePath: config.savePaths.basePath
        });
    }
    private getRowTrackInfo(row: Element, listSection: Element)
    {
        let isPlaylist = true;
        let albumName = (row.querySelector('a[href^="/album"]') as HTMLElement)?.innerText;
        let listTitle = listSection.querySelector("h1")?.innerText;

        if (!albumName) {
            isPlaylist = false;
            albumName = listTitle;
        }
        let menuBtn = row.querySelector(Selectors.rowMoreButton);

        if (albumName == null || menuBtn == null) return;

        let extraProps = Utils.getReactProps(row, menuBtn).menu.props;

        return {
            uri: extraProps.uri,
            vars: {
                track_name: row.querySelector(Selectors.rowTitle).innerText,
                artist_name: extraProps.artists[0].name,
                all_artist_names: extraProps.artists.map(v => v.name).join(", "),
                album_name: albumName,
                playlist_name: isPlaylist ? listTitle : "unknown",
                context_name: listTitle
            }
        };
    }
}
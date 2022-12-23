import DataSource from 'vview/data-sources/data-source.js';
import { helpers } from 'vview/misc/helpers.js';

// /artworks/illust_id?manga - Viewing manga pages for an illustration
export default class DataSource_MangaPages extends DataSource
{
    get name() { return "manga"; }
    get allowExpandingMangaPages() { return false; }

    constructor(url)
    {
        super(url);

        // /artworks/#
        url = new URL(url);
        url = helpers.getUrlWithoutLanguage(url);
        let parts = url.pathname.split("/");
        let illustId = parts[2];
        this.mediaId = helpers.illustIdToMediaId(illustId);
    }

    async loadPageInternal(page)
    {
        if(page != 1)
            return;

        // We need full illust info for getMangaAspectRatio, but we can fill out most of the
        // UI with thumbnail or illust info.  Load whichever one we have first and update, so we
        // display initial info quickly.
        this.mediaInfo = await ppixiv.mediaCache.getMediaInfo(this.mediaId, { full: false });
        this.callUpdateListeners();

        // Load media info before continuing.
        this.illustInfo = await ppixiv.mediaCache.getMediaInfo(this.mediaId);
        if(this.illustInfo == null)
            return;

        let pageMediaIds = [];
        for(let page = 0; page < this.illustInfo.pageCount; ++page)
            pageMediaIds.push(helpers.getMediaIdForPage(this.mediaId, page));

        this.addPage(page, pageMediaIds);
    }

    get pageTitle()
    {
        if(this.mediaInfo)
            return this.mediaInfo.userName + " - " + this.mediaInfo.illustTitle;
        else
            return "Illustrations";
    }

    getDisplayingText()
    {
        if(this.mediaInfo)
            return this.mediaInfo.illustTitle + " by " + this.mediaInfo.userName;
        else
            return "Illustrations";
    };

    // If all pages of the manga post we're viewing have around the same aspect ratio, use it
    // for thumbnails.
    getThumbnailAspectRatio()
    {
        if(this.illustInfo == null)
            return null;

        return this.getMangaAspectRatio(this.illustInfo.mangaPages);
    }

    get uiInfo()
    {
        return {
            userId: this.mediaInfo?.userId,
        }
    }

    // Given a list of manga info, return the aspect ratio to use to display them.
    // This can be passed as the "ratio" option to makeThumbnailSizingStyle.
    getMangaAspectRatio(mangaPages)
    {
        // A lot of manga posts use the same resolution for all images, or just have
        // one or two exceptions for things like title pages.  If most images have
        // about the same aspect ratio, use it.
        let total = 0;
        for(let mangaPage of mangaPages)
            total += mangaPage.width / mangaPage.height;

        let averageAspectRatio = total / mangaPages.length;
        let illustsFarFromAverage = 0;
        for(let mangaPage of mangaPages)
        {
            let ratio = mangaPage.width / mangaPage.height;
            if(Math.abs(averageAspectRatio - ratio) > 0.1)
                illustsFarFromAverage++;
        }

        // If we didn't find a common aspect ratio, just use square thumbs.
        if(illustsFarFromAverage > 3)
            return 1;
        else
            return averageAspectRatio;
    }
}
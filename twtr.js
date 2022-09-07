function ts() {
    return new Date().toISOString();
}

async function tweet(twtr, body) {
    console.log(
        `Got body to reply: ${JSON.stringify(body)} of type ${typeof body}`
    );
    if (typeof body === "string") {
        body = {
            text: body,
            quoted: null,
            media: null
        };
    }

    let request = {
        status: body.text,
    };

    if (body.media) {
        request.media_ids = body.media.join(",");
    }

    if (body.quoted) {
        request.attachment_url = body.quoted;
    }

    console.log(
        `${ts()}: Replying ${body.text.replace(
            "\n",
            "\\n"
        )} media: ${body.media ? body.media.join(
            ","
        ) : "N/A"} to tweet ${replyToId} and username ${replyToUsername}`
    );
    return await twtr.tweets
        .statusesUpdate(request)
        .then(resp => {
            return resp.id_str;
        })
        .catch(err => {
            console.log(err);
            return replyToId;
        });
}

async function uploadMedia(twtr, mediaBytes) {
    return await twtr.media
        .mediaUpload({media_data: mediaBytes})
        .then(resp => {
            return resp.media_id_string;
        })
        .catch(err => {
            console.log(`${ts()}: Failed to upload media: ${JSON.stringify(err)}`);
            return null;
        });
}

async function setAltText(twtr, mediaId, altText) {
    return await twtr.media.mediaMetadataCreate({
        media_id: mediaId,
        alt_text: {text: altText}
    }).then(() => true).catch(err => {
        console.log(`${ts()}: Error setting alt text on mediaId ${mediaId}: '${altText}'`)
        console.log(err)
        return null
    });
}

async function uploadImageWithAltText(twtr, mediaBytes, altText) {
    let mediaId = await uploadMedia(twtr, mediaBytes);
    if (!mediaId) {
        return null;
    }

    const altSet = await setAltText(twtr, mediaId, altText);
    if (altSet) {
        return mediaId;
    } else {
        return null
    }
}

exports.tweet = tweet;
exports.uploadImageWithAltText = uploadImageWithAltText;

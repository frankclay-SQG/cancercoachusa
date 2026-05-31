const { handleError, sanityQuery, sendJson } = require("./lib/sanity");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const slots = await sanityQuery(`*[
      _type == "scheduleSlot" &&
      isAvailable != false &&
      defined(start) &&
      start >= now()
    ] | order(start asc){
      _id,
      title,
      start,
      end,
      meetingType,
      description,
      location,
      bookingUrl,
      isAvailable
    }`);

    sendJson(response, 200, { slots: slots || [] });
  } catch (error) {
    handleError(response, error);
  }
};

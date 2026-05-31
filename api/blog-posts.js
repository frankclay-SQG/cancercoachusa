const { handleError, sanityQuery, sendJson } = require("./lib/sanity");

const POST_FIELDS = `{
  _id,
  title,
  "slug": slug.current,
  excerpt,
  publishedAt,
  category,
  "author": author->name,
  mainImage{
    alt,
    asset->{url, metadata{dimensions}}
  },
  body[]{
    ...,
    _type == "image" => {
      ...,
      alt,
      asset->{url, metadata{dimensions}}
    },
    _type == "file" => {
      ...,
      asset->{url, originalFilename, mimeType, size}
    }
  }
}`;

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const slug = request.query?.slug;
    const posts = await sanityQuery(
      slug
        ? `*[_type == "post" && slug.current == $slug && publishedAt <= now()][0]${POST_FIELDS}`
        : `*[_type == "post" && defined(slug.current) && publishedAt <= now()] | order(publishedAt desc)${POST_FIELDS}`,
      { slug }
    );

    sendJson(response, 200, { posts: slug ? posts ? [posts] : [] : posts || [] });
  } catch (error) {
    handleError(response, error);
  }
};

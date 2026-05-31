export default {
  name: "scheduleSlot",
  title: "Schedule Slot",
  type: "document",
  fields: [
    {
      name: "title",
      title: "Title",
      type: "string",
      initialValue: "Survivorship conversation",
      validation: (Rule) => Rule.required(),
    },
    {
      name: "start",
      title: "Start",
      type: "datetime",
      validation: (Rule) => Rule.required(),
    },
    {
      name: "end",
      title: "End",
      type: "datetime",
    },
    {
      name: "meetingType",
      title: "Meeting type",
      type: "string",
      options: {
        list: ["Intro Call", "Survivorship Coaching", "Caregiver Transition", "Resource Review"],
      },
    },
    {
      name: "description",
      title: "Description",
      type: "text",
      rows: 3,
    },
    {
      name: "location",
      title: "Location",
      type: "string",
      description: "Example: Google Meet, phone call, or office location.",
    },
    {
      name: "bookingUrl",
      title: "Booking URL",
      type: "url",
      description: "HubSpot meeting link, Google Calendar appointment link, or another scheduling URL.",
    },
    {
      name: "isAvailable",
      title: "Available",
      type: "boolean",
      initialValue: true,
    },
  ],
  preview: {
    select: {
      title: "title",
      subtitle: "start",
    },
  },
};

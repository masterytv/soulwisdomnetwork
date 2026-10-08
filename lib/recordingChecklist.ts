// The recording checklist in the Studio (/admin/podcast/recording): the settings and habits that give the
// pipeline the best recording, for two hosts on Zoom. The one setting the pipeline depends on is Zoom's
// separate audio file per participant: ingest takes those as speaker tracks (lib/speakerTracks.ts, spec 019
// item 3.3), and a recording folder with more than one video is skipped (agent/src/podcast/ingest.ts).
// Ticks are kept in each person's browser; the "every recording" sections clear for the next one.

export interface ChecklistItem {
    id: string;           // stable: ticks are saved under it
    text: string;
    why?: string;
}

export interface ChecklistSection {
    id: string;
    title: string;
    who: string;          // when and by whom
    everyRecording: boolean;
    items: ChecklistItem[];
}

export const RECORDING_CHECKLIST: ChecklistSection[] = [
    {
        id: 'zoom-account', title: 'Zoom account settings', who: 'Once · whoever hosts the Zoom meeting · zoom.us → Settings', everyRecording: false,
        items: [
            { id: 'separate-local', text: 'Recording → Local recording: turn on “Record a separate audio file for each participant who speaks”', why: 'The most important setting. Each voice gets its own track, cleaned on its own.' },
            { id: 'third-party-editor', text: 'Recording → Local recording: turn on “Optimize for 3rd party video editor”', why: 'Gives a steady frame rate the editor handles cleanly.' },
            { id: 'no-timestamp', text: 'Recording → Local recording: turn off “Add a timestamp to the recording”', why: 'Keeps the picture clean.' },
            { id: 'separate-cloud', text: 'If you use cloud recording: turn on “Record a separate audio file of each participant” and choose gallery view only', why: 'The Studio skips a folder with more than one video in it.' },
            { id: 'no-names', text: 'Recording: turn off “Display participants\' names in the recording”', why: 'Names come from the audio files. This keeps the video clean.' },
            { id: 'allow-original', text: 'Meeting → In Meeting (Advanced): turn on “Allow users to select original sound”', why: 'Without this, the Original sound button never appears.' },
            { id: 'group-hd', text: 'Meeting → In Meeting (Advanced): turn on “Group HD video”', why: '1080p if your plan allows it, otherwise 720p.' },
        ],
    },
    {
        id: 'equipment', title: 'Your equipment', who: 'Once · each of you', everyRecording: false,
        items: [
            { id: 'headphones', text: 'Wired headphones, never speakers', why: 'Speaker sound leaks back into your mic as echo.' },
            { id: 'mic', text: 'A dynamic mic (e.g. Shure MV7+, Rode PodMic, Samson Q2U)', why: 'A laptop or webcam mic undoes everything else here.' },
            { id: 'camera', text: 'A 16:9 camera that does 1080p', why: 'Anything else gets cropped to fill 1920×1080.' },
            { id: 'ethernet', text: 'A wired internet connection (ethernet)', why: 'Wi-Fi drops show up as frozen video and garbled audio.' },
        ],
    },
    {
        id: 'zoom-app', title: 'Zoom app settings', who: 'Every recording · each of you · Zoom app → Settings', everyRecording: true,
        items: [
            { id: 'display-name', text: 'Profile: display name is your real full name (e.g. “Tom Wood”)', why: 'Your speaker track is named from it.' },
            { id: 'original-sound', text: 'Audio: “Original sound for musicians” on, with “High-fidelity music mode”', why: 'Stops Zoom\'s noise suppression from damaging your voice. The Studio cleans the voice better afterwards.' },
            { id: 'echo-off', text: 'Audio: “Echo cancellation” off (both of you on headphones)', why: 'Only safe when neither of you is on speakers.' },
            { id: 'auto-volume-off', text: 'Audio: “Automatically adjust microphone volume” off', why: 'Stops Zoom moving your level mid-sentence.' },
            { id: 'input-level', text: 'Audio: input level set so your loudest laugh never hits the top of the meter (peaks about −12 dB)', why: 'Clipped audio can\'t be fixed afterwards.' },
            { id: 'hd', text: 'Video: “HD” on' },
            { id: 'no-touch-up', text: 'Video: “Touch up my appearance” off, no virtual or blurred background', why: 'They smear edges and hands.' },
        ],
    },
    {
        id: 'room', title: 'Your room and computer', who: 'Every recording · each of you', everyRecording: true,
        items: [
            { id: 'mic-distance', text: 'Mic 5–10 cm from your mouth, slightly off to the side', why: 'Close enough to drown out the room, off to the side to soften P and B sounds.' },
            { id: 'quiet', text: 'Fans, heaters and air conditioning off; door closed' },
            { id: 'light', text: 'Light in front of you, not behind; camera at eye level' },
            { id: 'power', text: 'Laptop plugged in; other apps closed' },
            { id: 'dnd', text: 'Phone and computer on Do Not Disturb', why: 'Notification pings land on your track.' },
            { id: 'water', text: 'Water nearby (no ice; it rattles)' },
        ],
    },
    {
        id: 'start', title: 'When the meeting starts', who: 'Every recording · both of you', everyRecording: true,
        items: [
            { id: 'original-on', text: 'Click “Original sound: On” at the top left of the Zoom window', why: 'Each of you has to do this, every meeting.' },
            { id: 'gallery', text: 'Switch to gallery view', why: 'Both faces side by side.' },
            { id: 'test', text: 'First time with these settings: record a 3-minute test and put it through the Studio first', why: 'Check the folder has one video plus one audio file per person, and listen to each.' },
            { id: 'record', text: 'Host starts the recording' },
            { id: 'silence', text: 'Stay silent for 5 seconds', why: 'Gives the clean-up a sample of the room\'s noise.' },
            { id: 'clap', text: 'Each clap once, one after the other', why: 'Makes any sync problem easy to spot.' },
            { id: 'backup', text: 'Optional: each record your own mic locally too (QuickTime, Audacity or the mic\'s app)', why: 'A backup if Zoom glitches. Don\'t swap it in for Zoom\'s track: it won\'t line up with the video.' },
        ],
    },
    {
        id: 'after', title: 'After recording', who: 'Every recording · the host', everyRecording: true,
        items: [
            { id: 'converted', text: 'Wait for Zoom to finish converting the recording', why: 'The folder isn\'t complete until it does.' },
            { id: 'folder', text: 'Check the folder: one video, plus an “Audio Record” subfolder with a file for each of you' },
            { id: 'drop', text: 'Drop the whole folder, as it is, into “01 To Process” in Drive (or upload the video here in the Studio)', why: 'The Studio picks it up and makes the episode, with your separate voice tracks.' },
        ],
    },
];

export const itemKey = (section: ChecklistSection, item: ChecklistItem) => `${section.id}/${item.id}`;

// The ticks left after "Clear for next recording": only the one-time sections'.
export function clearForNextRecording(ticks: Record<string, boolean>): Record<string, boolean> {
    const keep: Record<string, boolean> = {};
    for (const s of RECORDING_CHECKLIST) {
        if (s.everyRecording) continue;
        for (const i of s.items) if (ticks[itemKey(s, i)]) keep[itemKey(s, i)] = true;
    }
    return keep;
}

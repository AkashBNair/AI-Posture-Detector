const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

// Start webcam
navigator.mediaDevices.getUserMedia({ video: true })
.then(stream => {
    video.srcObject = stream;
})
.catch(err => {
    alert("Camera not working ❌");
});

// Load MediaPipe Pose
const pose = new Pose({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
    }
});

pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false
});

// When AI gives results
pose.onResults(results => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw video
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

    // Draw skeleton points
    if (results.poseLandmarks) {
        for (let lm of results.poseLandmarks) {
            ctx.beginPath();
            ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 5, 0, 2 * Math.PI);
            ctx.fillStyle = "red";
            ctx.fill();
        }
    }
});

// Send frames to AI
const camera = new Camera(video, {
    onFrame: async () => {
        await pose.send({ image: video });
    },
    width: 500,
    height: 500
});

camera.start();
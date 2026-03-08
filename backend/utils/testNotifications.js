import { getNotificationMessage } from './notificationMessages.js';

console.log("=== Testing Notification Messages Utility ===\n");

const tests = [
    { type: "meal", label: "Meal (with user Data)", userData: { userName: "Rahul" } },
    { type: "water", label: "Water (default user)", userData: undefined },
    { type: "protein", label: "Protein (with user Data)", userData: { userName: "Aditya" } },
    { type: "calorieSurplus", label: "Calorie Surplus", userData: undefined },
    { type: "sleep", label: "Sleep", userData: { userName: "Priya" } },
    { type: "fiber", label: "Fiber", userData: undefined },
    { type: "unknownType", label: "Fallback for Unknown Type", userData: undefined },
];

tests.forEach(t => {
    console.log(`--- ${t.label} ---`);
    const message = getNotificationMessage(t.type, t.userData);
    console.log(`Title: ${message.title}`);
    console.log(`Body:  ${message.body}`);
    console.log(`Emoji: ${message.emoji}`);
    console.log("\n");
});

console.log("=== Testing Randomness (Calling Water 3 times) ===");
for (let i = 0; i < 3; i++) {
    const msg = getNotificationMessage("water");
    console.log(`Water attempt ${i + 1}: ${msg.title}`);
}

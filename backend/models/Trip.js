import mongoose from 'mongoose';

const tripSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    tripDetails: {
        type: Object, // Storing the entire JSON response from AI
        required: true,
    },
}, { timestamps: true });

export default mongoose.model('Trip', tripSchema);

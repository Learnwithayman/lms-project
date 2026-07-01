const cron = require('node-cron');
const User = require('../models/User');
const ClassSession = require('../models/ClassSession');
const PayrollHistory = require('../models/PayrollHistory');
const whatsappClient = require('./whatsappBot');

const runMonthlyPayroll = async () => {
    console.log('⏳ Running monthly payroll snapshot and WhatsApp notifications...');
    try {
        // 1. Get the exact dates for the PREVIOUS month
        const now = new Date();
        const firstDayOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfLastMonth = new Date(firstDayOfCurrentMonth - 1); // 1 ms before this month
        const startOfLastMonth = new Date(endOfLastMonth.getFullYear(), endOfLastMonth.getMonth(), 1);

        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const monthLabel = `${monthNames[startOfLastMonth.getMonth()]} ${startOfLastMonth.getFullYear()}`;

        // 2. Prevent duplicate runs
        const existingRun = await PayrollHistory.findOne({ month: monthLabel });
        if (existingRun) {
            console.log(`⚠️ Payroll for ${monthLabel} was already generated! Skipping.`);
            return { message: `Payroll for ${monthLabel} already generated.` };
        }

        const teachers = await User.find({ role: { $regex: /teacher/i } });
        let processedCount = 0;

        // 3. Do the math, save the record, and text the teacher
        for (const teacher of teachers) {
            const completedClasses = await ClassSession.find({
                teacher: teacher._id,
                status: 'completed',
                startTime: { $gte: startOfLastMonth, $lte: endOfLastMonth }
            });

            const totalMinutes = completedClasses.reduce((sum, cls) => sum + (cls.durationMinutes || 0), 0);
            const hourlyRate = teacher.hourlyRate || 3.0;
            const totalHours = totalMinutes / 60;
            const baseEarnings = totalHours * hourlyRate;

            let adjustmentsTotal = 0;
            if (teacher.adjustments && teacher.adjustments.length > 0) {
                const lastMonthAdjustments = teacher.adjustments.filter(adj => {
                    const adjDate = new Date(adj.date);
                    return adjDate >= startOfLastMonth && adjDate <= endOfLastMonth;
                });
                adjustmentsTotal = lastMonthAdjustments.reduce((sum, adj) => sum + adj.amount, 0);
            }

            const finalEarnings = baseEarnings + adjustmentsTotal;

            // Only process teachers who actually made money or had hours
            if (finalEarnings > 0 || totalHours > 0) {
                // Save to Database
                await PayrollHistory.create({
                    month: monthLabel,
                    year: startOfLastMonth.getFullYear(),
                    teacherId: teacher._id,
                    name: teacher.name,
                    email: teacher.email,
                    totalHours: parseFloat(totalHours.toFixed(2)),
                    hourlyRate,
                    baseEarnings: parseFloat(baseEarnings.toFixed(2)),
                    adjustmentsTotal: parseFloat(adjustmentsTotal.toFixed(2)),
                    finalEarnings: parseFloat(finalEarnings.toFixed(2))
                });

                // Send WhatsApp Slip
                const targetGroup = teacher.whatsappGroupId || teacher.teacherGroupId || teacher.groupId;
                if (targetGroup) {
                    const message = `السلام عليكم / Assalamu Alaikum *${teacher.name}*! 🎓\n\nHere is your official Payroll Summary for *${monthLabel}*:\n\n⏱️ *Hours Taught:* ${totalHours.toFixed(2)} hrs\n💵 *Hourly Rate:* $${hourlyRate.toFixed(2)}\n💰 *Base Pay:* $${baseEarnings.toFixed(2)}\n✨ *Bonuses/Adjustments:* $${adjustmentsTotal.toFixed(2)}\n\n🏆 *Total Earnings:* *$${finalEarnings.toFixed(2)}*\n\nThank you for your hard work and dedication this month!\n\nWarm regards,\n*Learn With Ayman Admin Team*`;
                    
                    await whatsappClient.sendLmsNotification(targetGroup, message);
                }
                processedCount++;
            }
        }
        console.log(`✅ Monthly payroll for ${monthLabel} saved and sent to ${processedCount} teachers!`);
        return { message: `Success! Processed ${processedCount} teachers for ${monthLabel}.` };
    } catch (error) {
        console.error('🚨 Error running monthly payroll cron:', error);
        throw error;
    }
};

// Schedule it to run automatically on the 1st day of every month at 00:01 AM
const startPayrollCron = () => {
    cron.schedule('1 0 1 * *', () => {
        runMonthlyPayroll();
    });
    console.log('⏰ Monthly Payroll Cron Job initialized!');
};

module.exports = { startPayrollCron, runMonthlyPayroll };